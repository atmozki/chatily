const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const mongoose = require('mongoose');
const session = require('express-session');
const sharedsession = require("express-socket.io-session");
const bcrypt = require('bcrypt');

// Connect to MongoDB with updated options
mongoose.connect('mongodb://localhost/chatapp', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  useCreateIndex: true // Add this line to address the deprecation warning
});

// Rest of the server code remains the same
const userSchema = new mongoose.Schema({
  username: { type: String, unique: true, required: true },
  password: { type: String, required: true }
});

const User = mongoose.model('User', userSchema);

// Define Message schema
const messageSchema = new mongoose.Schema({
  user: String,
  content: String,
  timestamp: { type: Date, default: Date.now }
});

const Message = mongoose.model('Message', messageSchema);

// Function to clear all messages
async function clearMessages() {
  try {
    await Message.deleteMany({});
    console.log('All messages have been cleared.');
  } catch (err) {
    console.error('Error clearing messages:', err);
  }
}

// Clear messages when the server starts
clearMessages();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));
app.set('view engine', 'ejs');

// Set up session middleware
const sessionMiddleware = session({
  secret: 'main_session',
  resave: false,
  saveUninitialized: true
});

app.use(sessionMiddleware);

// Share session with io sockets
io.use(sharedsession(sessionMiddleware, {
  autoSave: true
}));

// Main route now renders the login page
app.get('/', (req, res) => {
  if (req.session.user) {
    res.redirect('/chat');
  } else {
    res.render('login');
  }
});

app.get('/register', (req, res) => {
  res.render('register');
});

// Registration route
app.post('/register', async (req, res) => {
  try {
    const { username, password } = req.body;
    
    // Check if user already exists
    const existingUser = await User.findOne({ username });
    if (existingUser) {
      return res.render('register', { error: 'Username already exists' });
    }
    
    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);
    
    // Create new user
    const user = new User({
      username,
      password: hashedPassword
    });
    
    await user.save();
    res.redirect('/');
  } catch (error) {
    console.error(error);
    res.render('register', { error: 'Error registering user' });
  }
});

// Login route
app.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    
    // Find user
    const user = await User.findOne({ username });
    if (!user) {
      return res.render('login', { error: 'Invalid username or password' });
    }
    
    // Check password
    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return res.render('login', { error: 'Invalid username or password' });
    }
    
    req.session.user = username;
    res.redirect('/chat');
  } catch (error) {
    console.error(error);
    res.render('login', { error: 'Error logging in' });
  }
});

// Logout route
app.get('/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/');
});

// Chat route
app.get('/chat', async (req, res) => {
  if (req.session.user) {
    try {
      const messages = await Message.find().sort('-timestamp').limit(50).exec();
      res.render('chat', { user: req.session.user, messages: messages.reverse() });
    } catch (err) {
      console.error(err);
      res.status(500).send('An error occurred');
    }
  } else {
    res.redirect('/');
  }
});

io.on('connection', (socket) => {
  console.log('A user connected');

  socket.on('chat message', async (msg) => {
    if (socket.handshake.session.user) {
      const message = new Message({
        user: socket.handshake.session.user,
        content: msg
      });

      try {
        await message.save();
        io.emit('chat message', { user: message.user, content: message.content });
      } catch (err) {
        console.error(err);
      }
    } else {
      console.log('User not authenticated');
    }
  });

  socket.on('disconnect', () => {
    console.log('User disconnected');
  });
});

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});