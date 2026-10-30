const express = require('express');
const db = require('../db');
const { authenticateToken } = require('../auth/jwt');

const router = express.Router();

const normalizeCategoryName = (value) => {
  if (typeof value !== 'string') {
    return '';
  }
  return value.trim();
};

const normalizeCategoryType = (value) => {
  if (typeof value !== 'string') {
    return '';
  }
  const normalized = value.trim().toLowerCase();
  if (normalized === 'expense' || normalized === 'income') {
    return normalized;
  }
  return '';
};

const requireAdmin = (req, res, next) => {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({
      error: {
        code: 'FORBIDDEN',
        message: 'Admin access required.',
      },
    });
  }

  return next();
};

const mapCategoryRow = (row) => ({
  categoryId: row.category_id,
  name: row.name,
  type: row.type,
  isCustom: Boolean(row.is_custom),
  userId: row.user_id,
});

const buildCategoryFilter = (typeFilter) => {
  const clauses = ['user_id IS NULL'];
  const params = [];

  if (typeof typeFilter === 'string' && typeFilter.trim() !== '') {
    const normalizedType = normalizeCategoryType(typeFilter);
    if (!normalizedType) {
      const error = new Error('type must be either expense or income.');
      error.statusCode = 400;
      error.code = 'VALIDATION_ERROR';
      throw error;
    }
    clauses.push('type = $1');
    params.push(normalizedType);
  }

  return {
    sql: `SELECT category_id, name, type, is_custom, user_id
      FROM categories
      WHERE ${clauses.join(' AND ')}
      ORDER BY type ASC, name ASC, category_id ASC`,
    params,
  };
};

router.use(authenticateToken, requireAdmin);

router.get(['/categories', '/predefined-categories'], async (req, res, next) => {
  try {
    const { type } = req.query || {};
    const { sql, params } = buildCategoryFilter(type);
    const result = await db.query(sql, params);

    return res.status(200).json({
      categories: result.rows.map(mapCategoryRow),
    });
  } catch (error) {
    return next(error);
  }
});

router.post(['/categories', '/predefined-categories'], async (req, res, next) => {
  try {
    const name = normalizeCategoryName(req.body && req.body.name);
    const type = normalizeCategoryType(req.body && req.body.type);

    if (!name) {
      const error = new Error('Category name is required.');
      error.statusCode = 400;
      error.code = 'VALIDATION_ERROR';
      throw error;
    }

    if (!type) {
      const error = new Error('type must be either expense or income.');
      error.statusCode = 400;
      error.code = 'VALIDATION_ERROR';
      throw error;
    }

    const existing = await db.query(
      `SELECT category_id FROM categories
       WHERE user_id IS NULL AND LOWER(name) = LOWER($1) AND type = $2
       LIMIT 1;`,
      [name, type]
    );

    if (existing.rows.length > 0) {
      const error = new Error('A predefined category with that name and type already exists.');
      error.statusCode = 409;
      error.code = 'CATEGORY_ALREADY_EXISTS';
      throw error;
    }

    const result = await db.query(
      `INSERT INTO categories (user_id, name, type, is_custom)
       VALUES (NULL, $1, $2, FALSE)
       RETURNING category_id, name, type, is_custom, user_id;`,
      [name, type]
    );

    return res.status(201).json({
      message: 'Predefined category created successfully.',
      category: mapCategoryRow(result.rows[0]),
    });
  } catch (error) {
    return next(error);
  }
});

router.put(['/categories/:categoryId', '/predefined-categories/:categoryId'], async (req, res, next) => {
  try {
    const { categoryId } = req.params || {};
    const name = normalizeCategoryName(req.body && req.body.name);
    const type = normalizeCategoryType(req.body && req.body.type);

    if (!categoryId || typeof categoryId !== 'string' || categoryId.trim() === '') {
      const error = new Error('categoryId is required.');
      error.statusCode = 400;
      error.code = 'VALIDATION_ERROR';
      throw error;
    }

    if (!name) {
      const error = new Error('Category name is required.');
      error.statusCode = 400;
      error.code = 'VALIDATION_ERROR';
      throw error;
    }

    if (!type) {
      const error = new Error('type must be either expense or income.');
      error.statusCode = 400;
      error.code = 'VALIDATION_ERROR';
      throw error;
    }

    const duplicate = await db.query(
      `SELECT category_id FROM categories
       WHERE user_id IS NULL AND category_id != $1 AND LOWER(name) = LOWER($2) AND type = $3
       LIMIT 1;`,
      [categoryId, name, type]
    );

    if (duplicate.rows.length > 0) {
      const error = new Error('A predefined category with that name and type already exists.');
      error.statusCode = 409;
      error.code = 'CATEGORY_ALREADY_EXISTS';
      throw error;
    }

    const result = await db.query(
      `UPDATE categories
       SET name = $1, type = $2
       WHERE category_id = $3 AND user_id IS NULL
       RETURNING category_id, name, type, is_custom, user_id;`,
      [name, type, categoryId]
    );

    if (result.rows.length === 0) {
      const error = new Error('Predefined category not found.');
      error.statusCode = 404;
      error.code = 'CATEGORY_NOT_FOUND';
      throw error;
    }

    return res.status(200).json({
      message: 'Predefined category updated successfully.',
      category: mapCategoryRow(result.rows[0]),
    });
  } catch (error) {
    return next(error);
  }
});

router.delete(['/categories/:categoryId', '/predefined-categories/:categoryId'], async (req, res, next) => {
  try {
    const { categoryId } = req.params || {};

    if (!categoryId || typeof categoryId !== 'string' || categoryId.trim() === '') {
      const error = new Error('categoryId is required.');
      error.statusCode = 400;
      error.code = 'VALIDATION_ERROR';
      throw error;
    }

    const result = await db.query(
      `DELETE FROM categories
       WHERE category_id = $1 AND user_id IS NULL
       RETURNING category_id;`,
      [categoryId]
    );

    if (result.rows.length === 0) {
      const error = new Error('Predefined category not found.');
      error.statusCode = 404;
      error.code = 'CATEGORY_NOT_FOUND';
      throw error;
    }

    return res.status(200).json({
      message: 'Predefined category deleted successfully.',
      categoryId,
    });
  } catch (error) {
    if (error.code === '23503') {
      const customError = new Error('This predefined category is in use by existing transactions and cannot be deleted.');
      customError.statusCode = 409;
      customError.code = 'CATEGORY_IN_USE';
      return next(customError);
    }
    return next(error);
  }
});

module.exports = router;
