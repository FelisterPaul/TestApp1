// server.js - Main Express Server
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const path = require('path');
const fs = require('fs').promises;
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-key-change-this';

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public')); // Serve your HTML file from public folder

// Simple file-based storage (upgrade to database later)
const DATA_FILE = path.join(__dirname, 'data', 'articles.json');
const USERS_FILE = path.join(__dirname, 'data', 'users.json');

// Ensure data directory exists
async function ensureDataDir() {
    try {
        await fs.mkdir(path.join(__dirname, 'data'), { recursive: true });
    } catch (error) {
        console.log('Data directory already exists');
    }
}

// Initialize data files
async function initializeData() {
    try {
        await fs.access(USERS_FILE);
    } catch (error) {
        // Create default admin user
        const hashedPassword = await bcrypt.hash('admin123', 10);
        const defaultUsers = [{
            id: 1,
            username: 'Hellena',
            password: hashedPassword,
            role: 'admin',
            createdAt: new Date().toISOString()
        }];
        await fs.writeFile(USERS_FILE, JSON.stringify(defaultUsers, null, 2));
        console.log('Created default admin user');
    }

    try {
        await fs.access(DATA_FILE);
    } catch (error) {
        // Create default articles
        const defaultArticles = [
            {
                id: 1,
                title: "My Journey into Software Engineering",
                content: "She believed in herself that she can do it. She is a software engineer, she codes and she loves it!\n\nThe journey began with a simple \"Hello World\" program, but it quickly evolved into a passion for creating elegant solutions to complex problems. Every day brings new challenges and opportunities to learn.",
                date: "2025-08-01",
                author: "Felister Paul",
                createdAt: new Date().toISOString()
            },
            {
                id: 2,
                title: "The Power of Persistence in Coding",
                content: "Debugging can be frustrating, but it's also where the most valuable learning happens. Each error message is a puzzle waiting to be solved, each bug a lesson in disguise.\n\nThrough persistence and dedication, what once seemed impossible becomes achievable. The key is to never stop learning and always believe in your capabilities.",
                date: "2025-07-28",
                author: "Felister Paul",
                createdAt: new Date().toISOString()
            }
        ];
        await fs.writeFile(DATA_FILE, JSON.stringify(defaultArticles, null, 2));
        console.log('Created default articles');
    }
}

// Helper functions for file operations
async function readArticles() {
    try {
        const data = await fs.readFile(DATA_FILE, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        return [];
    }
}

async function writeArticles(articles) {
    await fs.writeFile(DATA_FILE, JSON.stringify(articles, null, 2));
}

async function readUsers() {
    try {
        const data = await fs.readFile(USERS_FILE, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        return [];
    }
}

// Authentication middleware
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
        return res.status(401).json({ error: 'Access token required' });
    }

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) {
            return res.status(403).json({ error: 'Invalid or expired token' });
        }
        req.user = user;
        next();
    });
};

// Routes

// Authentication Routes
app.post('/api/login', async (req, res) => {
    try {
        const { username, password } = req.body;

        if (!username || !password) {
            return res.status(400).json({ error: 'Username and password required' });
        }

        const users = await readUsers();
        const user = users.find(u => u.username === username);

        if (!user) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        const isValidPassword = await bcrypt.compare(password, user.password);
        if (!isValidPassword) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        // Generate JWT token
        const token = jwt.sign(
            { 
                id: user.id, 
                username: user.username, 
                role: user.role 
            },
            JWT_SECRET,
            { expiresIn: '24h' }
        );

        res.json({
            success: true,
            token,
            user: {
                id: user.id,
                username: user.username,
                role: user.role
            }
        });
    } catch (error) {
        res.status(500).json({ error: 'Server error during login' });
    }
});

// Verify token endpoint
app.get('/api/verify', authenticateToken, (req, res) => {
    res.json({ 
        success: true, 
        user: req.user 
    });
});

// Article Routes

// Get all articles (public)
app.get('/api/articles', async (req, res) => {
    try {
        const articles = await readArticles();
        res.json(articles.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)));
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch articles' });
    }
});

// Get single article (public)
app.get('/api/articles/:id', async (req, res) => {
    try {
        const articles = await readArticles();
        const article = articles.find(a => a.id === parseInt(req.params.id));
        
        if (!article) {
            return res.status(404).json({ error: 'Article not found' });
        }
        
        res.json(article);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch article' });
    }
});

// Create new article (protected)
app.post('/api/articles', authenticateToken, async (req, res) => {
    try {
        const { title, content, date } = req.body;

        if (!title || !content) {
            return res.status(400).json({ error: 'Title and content are required' });
        }

        const articles = await readArticles();
        const newId = articles.length > 0 ? Math.max(...articles.map(a => a.id)) + 1 : 1;

        const newArticle = {
            id: newId,
            title: title.trim(),
            content: content.trim(),
            date: date || new Date().toISOString().split('T')[0],
            author: req.user.username,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };

        articles.push(newArticle);
        await writeArticles(articles);

        res.status(201).json(newArticle);
    } catch (error) {
        res.status(500).json({ error: 'Failed to create article' });
    }
});

// Update article (protected)
app.put('/api/articles/:id', authenticateToken, async (req, res) => {
    try {
        const { title, content, date } = req.body;
        const articleId = parseInt(req.params.id);

        if (!title || !content) {
            return res.status(400).json({ error: 'Title and content are required' });
        }

        const articles = await readArticles();
        const articleIndex = articles.findIndex(a => a.id === articleId);

        if (articleIndex === -1) {
            return res.status(404).json({ error: 'Article not found' });
        }

        articles[articleIndex] = {
            ...articles[articleIndex],
            title: title.trim(),
            content: content.trim(),
            date: date || articles[articleIndex].date,
            updatedAt: new Date().toISOString()
        };

        await writeArticles(articles);
        res.json(articles[articleIndex]);
    } catch (error) {
        res.status(500).json({ error: 'Failed to update article' });
    }
});

// Delete article (protected)
app.delete('/api/articles/:id', authenticateToken, async (req, res) => {
    try {
        const articleId = parseInt(req.params.id);
        const articles = await readArticles();
        const filteredArticles = articles.filter(a => a.id !== articleId);

        if (articles.length === filteredArticles.length) {
            return res.status(404).json({ error: 'Article not found' });
        }

        await writeArticles(filteredArticles);
        res.json({ success: true, message: 'Article deleted successfully' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete article' });
    }
});

// Health check
app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'healthy', 
        timestamp: new Date().toISOString(),
        version: '1.0.0'
    });
});

// Serve frontend
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Error handling middleware
app.use((error, req, res, next) => {
    console.error('Server Error:', error);
    res.status(500).json({ 
        error: 'Internal server error',
        message: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong'
    });
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({ error: 'Route not found' });
});

// Initialize and start server
async function startServer() {
    try {
        await ensureDataDir();
        await initializeData();
        
        app.listen(PORT, () => {
            console.log(`🚀 Server running on http://localhost:${PORT}`);
            console.log(`📊 Health check: http://localhost:${PORT}/api/health`);
            console.log(`📝 Default admin: username=Hellena, password=admin123`);
        });
    } catch (error) {
        console.error('Failed to start server:', error);
        process.exit(1);
    }
}

startServer();

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('\n🛑 Shutting down server gracefully...');
    process.exit(0);
});

// package.json - Dependencies
/*
{
  "name": "she-codes-blog-backend",
  "version": "1.0.0",
  "description": "Backend API for She CODES blog",
  "main": "server.js",
  "scripts": {
    "start": "node server.js",
    "dev": "nodemon server.js",
    "test": "echo \"Add tests here\" && exit 0"
  },
  "dependencies": {
    "express": "^4.18.2",
    "bcryptjs": "^2.4.3",
    "jsonwebtoken": "^9.0.2",
    "cors": "^2.8.5",
    "dotenv": "^16.3.1"
  },
  "devDependencies": {
    "nodemon": "^3.0.1"
  },
  "keywords": ["blog", "api", "express", "jwt"],
  "author": "Felister Paul",
  "license": "MIT"
}
*/

// .env file (create this separately)
/*
NODE_ENV=development
PORT=3000
JWT_SECRET=your-super-secret-jwt-key-make-it-long-and-random-123456789
*/

// Updated frontend JavaScript to work with backend
/*
// Replace the JavaScript section in your HTML with this:

class BlogAPI {
    constructor() {
        this.baseURL = 'http://localhost:3000/api';
        this.token = localStorage.getItem('authToken');
        this.isAdmin = false;
        this.init();
    }

    async init() {
        await this.checkAuth();
        this.bindEvents();
        this.loadArticles();
    }

    async checkAuth() {
        if (this.token) {
            try {
                const response = await fetch(`${this.baseURL}/verify`, {
                    headers: { 'Authorization': `Bearer ${this.token}` }
                });
                
                if (response.ok) {
                    const data = await response.json();
                    this.isAdmin = true;
                    this.updateAuthUI(data.user);
                    this.showAdminElements();
                } else {
                    this.logout();
                }
            } catch (error) {
                this.logout();
            }
        }
    }

    async login(username, password) {
        try {
            const response = await fetch(`${this.baseURL}/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });

            const data = await response.json();
            
            if (response.ok) {
                this.token = data.token;
                this.isAdmin = true;
                localStorage.setItem('authToken', this.token);
                this.updateAuthUI(data.user);
                this.showAdminElements();
                return { success: true };
            } else {
                return { success: false, error: data.error };
            }
        } catch (error) {
            return { success: false, error: 'Connection failed' };
        }
    }

    logout() {
        this.token = null;
        this.isAdmin = false;
        localStorage.removeItem('authToken');
        this.updateAuthUI(null);
        this.hideAdminElements();
    }

    async loadArticles() {
        try {
            const response = await fetch(`${this.baseURL}/articles`);
            const articles = await response.json();
            this.renderArticles(articles);
        } catch (error) {
            console.error('Failed to load articles:', error);
        }
    }

    async createArticle(title, content, date) {
        try {
            const response = await fetch(`${this.baseURL}/articles`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.token}`
                },
                body: JSON.stringify({ title, content, date })
            });

            if (response.ok) {
                this.loadArticles(); // Refresh articles
                return { success: true };
            } else {
                const error = await response.json();
                return { success: false, error: error.error };
            }
        } catch (error) {
            return { success: false, error: 'Failed to create article' };
        }
    }

    renderArticles(articles) {
        const container = document.querySelector('.container');
        const existingArticles = container.querySelectorAll('.article');
        existingArticles.forEach(article => article.remove());

        articles.forEach(article => {
            const articleElement = this.createArticleElement(article);
            container.appendChild(articleElement);
        });
    }

    createArticleElement(article) {
        const div = document.createElement('div');
        div.className = 'article';
        div.innerHTML = `
            ${this.isAdmin ? '<button class="edit-btn">Edit</button>' : ''}
            <h2 class="article-title">${article.title}</h2>
            <p class="article-date">${new Date(article.date).toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'long',
                day: 'numeric'
            })}</p>
            <p class="content">${article.content.replace(/\n/g, '</p><p class="content">')}</p>
        `;

        if (this.isAdmin) {
            div.querySelector('.edit-btn').addEventListener('click', () => {
                this.editArticle(article.id, div);
            });
        }

        return div;
    }

    updateAuthUI(user) {
        const userStatus = document.getElementById('userStatus');
        const authToggle = document.getElementById('authToggle');
        
        if (user) {
            userStatus.textContent = `Admin: ${user.username}`;
            authToggle.textContent = 'Logout';
        } else {
            userStatus.textContent = 'Guest';
            authToggle.textContent = 'Login';
        }
    }

    showAdminElements() {
        document.querySelector('.add-article-btn').style.display = 'flex';
        document.querySelectorAll('.edit-btn').forEach(btn => btn.style.display = 'block');
    }

    hideAdminElements() {
        document.querySelector('.add-article-btn').style.display = 'none';
        document.querySelectorAll('.edit-btn').forEach(btn => btn.style.display = 'none');
    }

    bindEvents() {
        // Auth toggle
        document.getElementById('authToggle').addEventListener('click', () => {
            if (this.isAdmin) {
                this.logout();
            } else {
                document.getElementById('loginForm').classList.toggle('hidden');
            }
        });

        // Login form
        document.getElementById('loginForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            const username = document.getElementById('username').value;
            const password = document.getElementById('password').value;

            const result = await this.login(username, password);
            if (result.success) {
                document.getElementById('loginForm').classList.add('hidden');
                document.getElementById('loginForm').reset();
            } else {
                alert(result.error || 'Login failed');
            }
        });

        // Add article button
        document.querySelector('.add-article-btn').addEventListener('click', async () => {
            const title = prompt('Enter article title:');
            if (!title || title.trim() === '') return;

            const content = prompt('Enter article content:');
            if (!content || content.trim() === '') return;

            const result = await this.createArticle(title, content);
            if (!result.success) {
                alert(result.error || 'Failed to create article');
            }
        });
    }
}

// Initialize the blog when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new BlogAPI();
});
*/