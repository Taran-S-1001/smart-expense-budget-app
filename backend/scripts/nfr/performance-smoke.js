#!/usr/bin/env node
'use strict';

const { performance } = require('node:perf_hooks');

const DEFAULTS = {
  requests: 30,
  concurrency: 5,
  timeoutMs: 5000,
  maxResponseTimeMs: 2000,
  minPassingPercent: 90,
};

function percentile(values, percentileValue) {
  if (!Array.isArray(values) || values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.max(0, Math.ceil((percentileValue / 100) * sorted.length) - 1);
  return sorted[index];
}

function summarizeSamples(samples, maxResponseTimeMs = DEFAULTS.maxResponseTimeMs, minPassingPercent = DEFAULTS.minPassingPercent) {
  if (!Array.isArray(samples) || samples.length === 0) {
    throw new Error('At least one performance sample is required.');
  }

  const durations = samples.map((sample) => Number(sample.durationMs));
  if (durations.some((duration) => !Number.isFinite(duration) || duration < 0)) {
    throw new Error('Every sample must have a finite, non-negative durationMs value.');
  }

  const successfulCount = samples.filter((sample) => sample.ok === true).length;
  const withinBudgetCount = samples.filter(
    (sample) => sample.ok === true && sample.durationMs <= maxResponseTimeMs
  ).length;
  const successPercent = (successfulCount / samples.length) * 100;
  const passingPercent = (withinBudgetCount / samples.length) * 100;
  const p90Ms = percentile(durations, 90);

  return {
    sampleCount: samples.length,
    successfulCount,
    withinBudgetCount,
    successPercent: Number(successPercent.toFixed(2)),
    passingPercent: Number(passingPercent.toFixed(2)),
    p90Ms: Number(p90Ms.toFixed(2)),
    maxResponseTimeMs,
    minPassingPercent,
    passed: p90Ms <= maxResponseTimeMs && passingPercent >= minPassingPercent,
  };
}

function positiveIntegerFromEnv(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(name + ' must be a positive integer.');
  }
  return value;
}

function requiredUrl(name) {
  const raw = process.env[name];
  if (!raw) throw new Error(name + ' is required.');
  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error(name + ' must be a valid absolute URL.');
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error(name + ' must use HTTP or HTTPS.');
  }
  return parsed.toString();
}

async function sendRequest(url, method, headers, body, timeoutMs) {
  const controller = new AbortController();
  const startedAt = performance.now();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    if (typeof fetch !== 'function') {
      throw new Error('This script requires Node.js 18 or later (global fetch is unavailable).');
    }
    const response = await fetch(url, {
      method,
      headers,
      body,
      signal: controller.signal,
    });
    // Consume the body so duration includes the complete response transfer.
    await response.arrayBuffer();
    return {
      ok: response.ok,
      status: response.status,
      durationMs: performance.now() - startedAt,
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      error: error.name === 'AbortError' ? 'TIMEOUT' : error.message,
      durationMs: performance.now() - startedAt,
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function runBatch({ label, url, method, headers, body, requests, concurrency, timeoutMs, maxResponseTimeMs, minPassingPercent }) {
  const samples = new Array(requests);
  let nextIndex = 0;

  async function worker() {
    while (true) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= requests) return;
      samples[index] = await sendRequest(url, method, headers, body, timeoutMs);
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, requests) }, () => worker());
  await Promise.all(workers);

  const summary = summarizeSamples(samples, maxResponseTimeMs, minPassingPercent);
  console.log(JSON.stringify({ label, url, method, ...summary }, null, 2));
  return summary;
}

async function main() {
  const loadUrl = requiredUrl('NFR_LOAD_URL');
  const saveUrl = requiredUrl('NFR_SAVE_URL');

  // Repeated POST requests create records. Require an explicit opt-in to prevent
  // accidental writes to a production database.
  if (process.env.NFR_ALLOW_WRITE !== 'true') {
    throw new Error('Set NFR_ALLOW_WRITE=true only after confirming both URLs point to a staging/test environment.');
  }

  const rawBody = process.env.NFR_SAVE_BODY;
  if (!rawBody) throw new Error('NFR_SAVE_BODY is required and must match the transaction API contract.');
  let parsedBody;
  try {
    parsedBody = JSON.parse(rawBody);
  } catch {
    throw new Error('NFR_SAVE_BODY must be valid JSON.');
  }

  const requests = positiveIntegerFromEnv('NFR_REQUESTS', DEFAULTS.requests);
  const concurrency = positiveIntegerFromEnv('NFR_CONCURRENCY', DEFAULTS.concurrency);
  const timeoutMs = positiveIntegerFromEnv('NFR_TIMEOUT_MS', DEFAULTS.timeoutMs);
  const maxResponseTimeMs = positiveIntegerFromEnv('NFR_MAX_RESPONSE_TIME_MS', DEFAULTS.maxResponseTimeMs);
  const minPassingPercent = positiveIntegerFromEnv('NFR_MIN_PASSING_PERCENT', DEFAULTS.minPassingPercent);
  if (minPassingPercent > 100) throw new Error('NFR_MIN_PASSING_PERCENT cannot exceed 100.');

  const headers = { Accept: 'application/json' };
  if (process.env.NFR_AUTH_TOKEN) {
    headers.Authorization = 'Bearer ' + process.env.NFR_AUTH_TOKEN;
  }

  const loadSummary = await runBatch({
    label: 'TC-Perf-01 read / screen-data endpoint',
    url: loadUrl,
    method: 'GET',
    headers,
    body: undefined,
    requests,
    concurrency,
    timeoutMs,
    maxResponseTimeMs,
    minPassingPercent,
  });

  headers['Content-Type'] = 'application/json';
  const saveSummary = await runBatch({
    label: 'TC-Perf-01 transaction-save endpoint',
    url: saveUrl,
    method: 'POST',
    headers,
    body: JSON.stringify(parsedBody),
    requests,
    concurrency,
    timeoutMs,
    maxResponseTimeMs,
    minPassingPercent,
  });

  const passed = loadSummary.passed && saveSummary.passed;
  console.log('TC-Perf-01: ' + (passed ? 'PASS' : 'FAIL') +
    ' (p90 <= ' + maxResponseTimeMs + ' ms and >= ' + minPassingPercent +
    '% successful responses within budget).');
  if (!passed) process.exitCode = 1;
}

if (require.main === module) {
  main().catch((error) => {
    console.error('NFR performance check could not run: ' + error.message);
    process.exitCode = 1;
  });
}

module.exports = { percentile, summarizeSamples };
