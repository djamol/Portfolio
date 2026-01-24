const express = require('express');
const router = express.Router();
const db = require('../config/database');

// Export all portfolio data
router.get('/export', async (req, res) => {
  try {
    const pool = db.getPool();
    
    // Get all investments
    const [investments] = await pool.query(`
      SELECT 
        id,
        website_app_name,
        investment_type,
        sub_type_name,
        sub_type_category,
        amount,
        investment_date,
        notes,
        created_at,
        updated_at
      FROM investments 
      ORDER BY investment_date DESC, created_at DESC
    `);
    
    res.json({ success: true, data: investments });
  } catch (error) {
    console.error('Error exporting portfolio:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Import portfolio data with upsert logic
router.post('/import', async (req, res) => {
  try {
    const investments = req.body;
    
    if (!Array.isArray(investments) || investments.length === 0) {
      return res.status(400).json({ 
        success: false, 
        error: 'Invalid data format. Expected array of investments.' 
      });
    }
    
    const pool = db.getPool();
    let importedCount = 0;
    let updatedCount = 0;
    let errors = [];
    
    for (const investment of investments) {
      try {
        const { 
          website_app_name, 
          investment_type, 
          sub_type_name, 
          sub_type_category, 
          amount, 
          investment_date, 
          notes 
        } = investment;
        
        if (!website_app_name || !investment_type || !amount || !investment_date) {
          errors.push(`Skipping record: Missing required fields for ${website_app_name || 'unknown'} - ${investment_type || 'unknown'}`);
          continue;
        }
        
        // Check if investment already exists based on unique combination
        const [existing] = await pool.query(
          `SELECT id FROM investments 
           WHERE website_app_name = ? AND investment_type = ? AND sub_type_name = ? AND sub_type_category = ?
           LIMIT 1`,
          [website_app_name, investment_type, sub_type_name || null, sub_type_category || null]
        );
        
        if (existing.length > 0) {
          // Update existing investment
          await pool.query(
            `UPDATE investments 
             SET amount = ?, investment_date = ?, notes = ?, updated_at = CURRENT_TIMESTAMP
             WHERE id = ?`,
            [amount, investment_date, notes || null, existing[0].id]
          );
          
          // Add to history
          await pool.query(
            `INSERT INTO investment_history (investment_id, amount, change_date, change_type, notes)
             VALUES (?, ?, ?, 'import_updated', ?)`,
            [existing[0].id, amount, investment_date, notes || null]
          );
          
          updatedCount++;
        } else {
          // Insert new investment
          const [result] = await pool.query(
            `INSERT INTO investments (website_app_name, investment_type, sub_type_name, sub_type_category, amount, investment_date, notes)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [website_app_name, investment_type, sub_type_name || null, sub_type_category || null, amount, investment_date, notes || null]
          );
          
          // Add to history
          await pool.query(
            `INSERT INTO investment_history (investment_id, amount, change_date, change_type, notes)
             VALUES (?, ?, ?, 'import_added', ?)`,
            [result.insertId, amount, investment_date, notes || null]
          );
          
          importedCount++;
        }
      } catch (error) {
        errors.push(`Error processing investment ${investment.website_app_name || 'unknown'}: ${error.message}`);
      }
    }
    
    res.json({ 
      success: true, 
      data: {
        imported: importedCount,
        updated: updatedCount,
        errors: errors,
        totalProcessed: investments.length
      },
      message: `Import completed: ${importedCount} new investments added, ${updatedCount} existing investments updated.`
    });
  } catch (error) {
    console.error('Error importing portfolio:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;