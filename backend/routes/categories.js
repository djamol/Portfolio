const express = require('express');
const router = express.Router();
const db = require('../config/database');

// Get all sub-type names
router.get('/sub-type-names', async (req, res) => {
  try {
    const pool = db.getPool();
    const [rows] = await pool.query(
      'SELECT * FROM sub_type_names ORDER BY investment_type, name ASC'
    );
    res.json({ success: true, data: rows });
  } catch (error) {
    console.error('Error fetching sub-type names:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Create new sub-type name (POST before parameterized GET)
router.post('/sub-type-names', async (req, res) => {
  try {
    const { name, investment_type } = req.body;
    
    if (!name || !investment_type) {
      return res.status(400).json({ 
        success: false, 
        error: 'Missing required fields: name, investment_type' 
      });
    }

    const pool = db.getPool();
    const [result] = await pool.query(
      'INSERT INTO sub_type_names (name, investment_type) VALUES (?, ?)',
      [name, investment_type]
    );

    const [newSubType] = await pool.query(
      'SELECT * FROM sub_type_names WHERE id = ?',
      [result.insertId]
    );

    res.status(201).json({ success: true, data: newSubType[0] });
  } catch (error) {
    // Handle duplicate entry error
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ 
        success: false, 
        error: 'Sub-type name already exists' 
      });
    }
    console.error('Error creating sub-type name:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get all sub-type names for a specific investment type (after POST)
router.get('/sub-type-names/:investmentType', async (req, res) => {
  try {
    const pool = db.getPool();
    const [rows] = await pool.query(
      'SELECT * FROM sub_type_names WHERE investment_type = ? ORDER BY name ASC',
      [req.params.investmentType]
    );
    res.json({ success: true, data: rows });
  } catch (error) {
    console.error('Error fetching sub-type names:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Create new category (POST before parameterized GET)
router.post('/categories', async (req, res) => {
  try {
    const { category, sub_type_name_id, investment_type } = req.body;
    
    if (!category || !investment_type) {
      return res.status(400).json({ 
        success: false, 
        error: 'Missing required fields: category, investment_type' 
      });
    }

    const pool = db.getPool();
    const [result] = await pool.query(
      'INSERT INTO sub_type_categories (category, sub_type_name_id, investment_type) VALUES (?, ?, ?)',
      [category, sub_type_name_id || null, investment_type]
    );

    const [newCategory] = await pool.query(
      'SELECT c.*, s.name as sub_type_name FROM sub_type_categories c LEFT JOIN sub_type_names s ON c.sub_type_name_id = s.id WHERE c.id = ?',
      [result.insertId]
    );

    res.status(201).json({ success: true, data: newCategory[0] });
  } catch (error) {
    // Handle duplicate entry error
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ 
        success: false, 
        error: 'Category already exists for this sub-type' 
      });
    }
    console.error('Error creating category:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get categories for a specific sub-type name and investment type
router.get('/categories/:investmentType/:subTypeNameId?', async (req, res) => {
  try {
    const pool = db.getPool();
    const { investmentType, subTypeNameId } = req.params;
    
    let query = `
      SELECT c.*, s.name as sub_type_name 
      FROM sub_type_categories c
      LEFT JOIN sub_type_names s ON c.sub_type_name_id = s.id
      WHERE c.investment_type = ?
    `;
    const params = [investmentType];
    
    if (subTypeNameId && subTypeNameId !== 'null') {
      query += ' AND (c.sub_type_name_id = ? OR c.sub_type_name_id IS NULL)';
      params.push(subTypeNameId);
    }
    
    query += ' ORDER BY c.category ASC';
    
    const [rows] = await pool.query(query, params);
    res.json({ success: true, data: rows });
  } catch (error) {
    console.error('Error fetching categories:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Delete sub-type name
router.delete('/sub-type-names/:id', async (req, res) => {
  try {
    const pool = db.getPool();
    await pool.query('DELETE FROM sub_type_names WHERE id = ?', [req.params.id]);
    res.json({ success: true, message: 'Sub-type name deleted successfully' });
  } catch (error) {
    console.error('Error deleting sub-type name:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Delete category
router.delete('/categories/:id', async (req, res) => {
  try {
    const pool = db.getPool();
    await pool.query('DELETE FROM sub_type_categories WHERE id = ?', [req.params.id]);
    res.json({ success: true, message: 'Category deleted successfully' });
  } catch (error) {
    console.error('Error deleting category:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
