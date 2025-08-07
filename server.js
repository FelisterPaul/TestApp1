// server.js - Main Express Server
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs').promises;
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// Add these constants
const ADMIN_USERNAME = 'felister';
const ADMIN_PASSWORD = 'admin123'; // In production, use hashed password
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

const app = express();
const PORT = process.env.PORT || 3000;

// Ensure data directory exists
const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'articles.json');

// Create data directory if it doesn't exist
async function ensureDataDir() {
    try {
        await fs.access(DATA_DIR);
    } catch (error) {
        if (error.code === 'ENOENT') {
            await fs.mkdir(DATA_DIR);
        }
    }
}

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Authentication middleware
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ error: 'Access denied' });
    }

    try {
        const verified = jwt.verify(token, JWT_SECRET);
        req.user = verified;
        next();
    } catch (error) {
        res.status(403).json({ error: 'Invalid token' });
    }
};

// Root route
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Health check endpoint
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Articles data file path

// Helper function to read articles
async function readArticles() {
    try {
        const data = await fs.readFile(DATA_FILE, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        if (error.code === 'ENOENT') {
            await fs.writeFile(DATA_FILE, JSON.stringify([]));
            return [];
        }
        throw error;
    }
}

// Helper function to write articles
async function writeArticles(articles) {
    await fs.writeFile(DATA_FILE, JSON.stringify(articles, null, 2));
}

// API Routes
app.get('/api/articles', async (req, res, next) => {
    try {
        const articles = await readArticles();
        res.json(articles);
    } catch (error) {
        next(error);
    }
});

// Update the login route
app.post('/api/login', async (req, res) => {
    console.log('Login attempt:', req.body); // Debug log
    const { username, password } = req.body;

    // Check credentials
    if (username === 'felister' && password === 'admin123') {
        const token = jwt.sign({ username }, process.env.JWT_SECRET);
        console.log('Login successful'); // Debug log
        res.json({ 
            success: true,
            token,
            message: 'Login successful'
        });
    } else {
        console.log('Login failed'); // Debug log
        res.status(401).json({ 
            success: false,
            error: 'Invalid credentials'
        });
    }
});

app.post('/api/articles', authenticateToken, async (req, res, next) => {
    try {
        const { title, content } = req.body;
        const articles = await readArticles();
        const newArticle = {
            id: Date.now().toString(),
            title,
            content,
            date: new Date().toISOString()
        };
        articles.unshift(newArticle);
        await writeArticles(articles);
        res.status(201).json(newArticle);
    } catch (error) {
        next(error);
    }
});

app.put('/api/articles/:id', authenticateToken, async (req, res, next) => {
    try {
        const { title, content } = req.body;
        const articles = await readArticles();
        const article = articles.find(a => a.id === req.params.id);
        
        if (!article) {
            return res.status(404).json({ 
                error: 'Article not found' 
            });
        }

        article.title = title;
        article.content = content;
        article.updatedAt = new Date().toISOString();
        
        await writeArticles(articles);
        res.json(article);
    } catch (error) {
        next(error);
    }
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ 
        error: 'Internal server error',
        message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong'
    });
});

// Initialize server
async function initServer() {
    try {
        await ensureDataDir();
        
        app.listen(PORT, () => {
            console.log(`Server running on http://localhost:${PORT}`);
        });
    } catch (error) {
        console.error('Failed to initialize server:', error);
        process.exit(1);
    }
}

initServer();