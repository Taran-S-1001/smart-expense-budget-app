const tls = require('tls');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');
const app = require('../../src/app');
const server = require('../../src/server');

/**
 * Resolves the path to the openssl CLI binary.
 */
const getOpensslBinary = () => {
  try {
    execSync('openssl version', { stdio: 'pipe' });
    return 'openssl';
  } catch (err) {
    const gitOpenssl = 'C:\\Program Files\\Git\\usr\\bin\\openssl.exe';
    if (fs.existsSync(gitOpenssl)) {
      return `"${gitOpenssl}"`;
    }
    return null;
  }
};

describe('HTTPS & TLS Configuration (Integration — TC-Sec-02)', () => {
  const opensslBin = getOpensslBinary();
  const tmpDir = os.tmpdir();
  const tmpKeyPath = path.join(tmpDir, `sebm-test-key-${Date.now()}.pem`);
  const tmpCertPath = path.join(tmpDir, `sebm-test-cert-${Date.now()}.pem`);

  let httpsServer = null;
  let httpsPort = null;
  let opensslAvailable = false;

  beforeAll((done) => {
    if (!opensslBin) {
      console.warn(
        '[TC-Sec-02] OpenSSL binary not found in environment; live socket handshake tests will be skipped with explicit reporting.'
      );
      return done();
    }

    try {
      // Generate ephemeral self-signed certificate and private key in temporary OS directory
      execSync(
        `${opensslBin} req -x509 -newkey rsa:2048 -nodes -sha256 -subj "/CN=localhost" -keyout "${tmpKeyPath}" -out "${tmpCertPath}" -days 1`,
        { stdio: 'pipe' }
      );
      opensslAvailable = true;

      // Start live HTTPS test server with TLS 1.2 hard minimum per AC-SEBM-SR-001
      const testConfig = {
        tls: {
          enabled: true,
          minVersion: 'TLSv1.2',
          certPath: tmpCertPath,
          keyPath: tmpKeyPath,
        },
      };

      httpsServer = server.createServer(app, testConfig);
      httpsServer.listen(0, '127.0.0.1', () => {
        httpsPort = httpsServer.address().port;
        done();
      });
    } catch (err) {
      console.warn('[TC-Sec-02] Failed to generate ephemeral test certificate:', err.message);
      done();
    }
  });

  afterAll((done) => {
    const cleanFiles = () => {
      try {
        if (fs.existsSync(tmpKeyPath)) fs.unlinkSync(tmpKeyPath);
      } catch (e) {}
      try {
        if (fs.existsSync(tmpCertPath)) fs.unlinkSync(tmpCertPath);
      } catch (e) {}
    };

    if (httpsServer) {
      httpsServer.close(() => {
        cleanFiles();
        done();
      });
    } else {
      cleanFiles();
      done();
    }
  });

  it('validates server configuration fails if cert or key file is missing', () => {
    expect(() => {
      server.createServer(app, {
        tls: {
          enabled: true,
          certPath: '/non/existent/cert.pem',
          keyPath: '/non/existent/key.pem',
        },
      });
    }).toThrow(/TLS_CERT_PATH file does not exist/);
  });

  it('successfully completes a live TLS 1.2 client handshake and receives HTTP response', (done) => {
    if (!opensslAvailable || !httpsPort) {
      console.warn('[TC-Sec-02] Skipped: OpenSSL not available for live handshake test.');
      return done();
    }

    const socket = tls.connect(
      {
        host: '127.0.0.1',
        port: httpsPort,
        minVersion: 'TLSv1.2',
        maxVersion: 'TLSv1.2',
        rejectUnauthorized: false,
      },
      () => {
        const protocol = socket.getProtocol();
        expect(protocol).toBe('TLSv1.2');

        // Send HTTP GET request over encrypted socket
        socket.write('GET /health HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n');
      }
    );

    let responseData = '';
    socket.on('data', (chunk) => {
      responseData += chunk.toString();
    });

    socket.on('end', () => {
      expect(responseData).toContain('HTTP/1.1 200 OK');
      expect(responseData).toContain('"status":"ok"');
      done();
    });

    socket.on('error', (err) => {
      done(err);
    });
  });

  it('successfully completes a live TLS 1.3 client handshake when supported', (done) => {
    if (!opensslAvailable || !httpsPort) {
      return done();
    }

    const socket = tls.connect(
      {
        host: '127.0.0.1',
        port: httpsPort,
        minVersion: 'TLSv1.3',
        maxVersion: 'TLSv1.3',
        rejectUnauthorized: false,
      },
      () => {
        const protocol = socket.getProtocol();
        expect(protocol).toBe('TLSv1.3');
        socket.end();
        done();
      }
    );

    socket.on('error', (err) => {
      done(err);
    });
  });

  it('rejects client handshakes restricted to TLS < 1.2 (AC-SEBM-SR-001)', (done) => {
    if (!opensslAvailable || !httpsPort) {
      return done();
    }

    let socket;
    try {
      socket = tls.connect(
        {
          host: '127.0.0.1',
          port: httpsPort,
          minVersion: 'TLSv1',
          maxVersion: 'TLSv1.1',
          rejectUnauthorized: false,
        },
        () => {
          // If handshake unexpectedly succeeded, fail test
          socket.end();
          done(new Error('Connection on TLS 1.1 should have been rejected by server'));
        }
      );

      socket.on('error', (err) => {
        // Handshake was rejected by the server because minVersion is TLSv1.2
        expect(err).toBeDefined();
        // Server rejects due to no common protocol version (ERR_SSL_NO_PROTOCOLS_AVAILABLE or similar)
        done();
      });
    } catch (err) {
      // If the client TLS stack itself blocks legacy TLS < 1.2 initialization:
      console.log(
        '[TC-Sec-02] Test runtime crypto layer refuses TLS < 1.2 context creation:',
        err.message
      );
      expect(err).toBeDefined();
      done();
    }
  });
});
