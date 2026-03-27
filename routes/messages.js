/**
 * NOIRE — Messaging Routes
 * GET  /api/messages/conversations           (auth) — my conversations
 * POST /api/messages/conversations           (auth) — start new conversation
 * GET  /api/messages/conversations/:id       (auth) — get messages in conv
 * POST /api/messages/conversations/:id       (auth) — send message (text/image)
 * PUT  /api/messages/conversations/:id/read  (auth) — mark as read
 */

const router = require('express').Router();
const { ConversationModel, MessageModel } = require('../models/db');
const { requireAuth } = require('../middleware/auth');
const { upload, setFolder, relativePath } = require('../middleware/upload');

/* ── GET conversations ──────────────────────────────────────── */
router.get('/conversations', requireAuth, (req, res) => {
  try {
    const convs = ConversationModel.findByUser.all(req.user.id);
    res.json({ conversations: convs });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load conversations.' });
  }
});

/* ── POST start new conversation ────────────────────────────── */
router.post('/conversations', requireAuth, (req, res) => {
  try {
    const { subject, message } = req.body;
    if (!subject || subject.trim().length < 3) {
      return res.status(400).json({ error: 'Subject must be at least 3 characters.' });
    }
    if (!message || message.trim().length < 2) {
      return res.status(400).json({ error: 'Opening message is required.' });
    }
    const convResult = ConversationModel.create.run({
      user_id: req.user.id,
      custom_order_id: null,
      subject: subject.trim(),
    });
    const convId = convResult.lastInsertRowid;
    MessageModel.create.run({
      conversation_id: convId,
      sender_id:   req.user.id,
      sender_role: req.user.role,
      content:     message.trim(),
      image_path:  null,
    });
    ConversationModel.updateLastMsg.run(convId);
    const conv = ConversationModel.findById.get(convId);
    res.status(201).json({ message: 'Conversation started.', conversation: conv });
  } catch (err) {
    res.status(500).json({ error: 'Failed to start conversation.' });
  }
});

/* ── GET messages in conversation ───────────────────────────── */
router.get('/conversations/:id', requireAuth, (req, res) => {
  try {
    const convId = Number(req.params.id);
    const conv   = ConversationModel.findById.get(convId);
    if (!conv) return res.status(404).json({ error: 'Conversation not found.' });
    if (req.user.role !== 'admin' && conv.user_id !== req.user.id) {
      return res.status(403).json({ error: 'Access denied.' });
    }
    const messages = MessageModel.findByConv.all(convId);
    // Mark messages from the other party as read
    const otherRole = req.user.role === 'admin' ? 'user' : 'admin';
    MessageModel.markRead.run(convId, otherRole);
    res.json({ conversation: conv, messages });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load messages.' });
  }
});

/* ── POST send message (text or image) ──────────────────────── */
router.post(
  '/conversations/:id',
  requireAuth,
  setFolder('messages'),
  upload.single('image'),
  (req, res) => {
    try {
      const convId = Number(req.params.id);
      const conv   = ConversationModel.findById.get(convId);
      if (!conv) return res.status(404).json({ error: 'Conversation not found.' });
      if (req.user.role !== 'admin' && conv.user_id !== req.user.id) {
        return res.status(403).json({ error: 'Access denied.' });
      }

      const content   = (req.body.content || '').trim();
      const imagePath = req.file ? relativePath(req.file.path) : null;

      if (!content && !imagePath) {
        return res.status(400).json({ error: 'Message must have text or an image.' });
      }

      const msgResult = MessageModel.create.run({
        conversation_id: convId,
        sender_id:   req.user.id,
        sender_role: req.user.role,
        content:     content || null,
        image_path:  imagePath,
      });

      ConversationModel.updateLastMsg.run(convId);

      const msg = {
        id:              msgResult.lastInsertRowid,
        conversation_id: convId,
        sender_id:       req.user.id,
        sender_role:     req.user.role,
        sender_name:     req.user.name,
        content,
        image_path:      imagePath,
        is_read:         0,
        created_at:      new Date().toISOString(),
      };

      res.status(201).json({ message: msg });
    } catch (err) {
      console.error('[MESSAGES] Send:', err);
      res.status(500).json({ error: 'Failed to send message.' });
    }
  }
);

/* ── PUT mark all as read ───────────────────────────────────── */
router.put('/conversations/:id/read', requireAuth, (req, res) => {
  try {
    const convId = Number(req.params.id);
    const conv   = ConversationModel.findById.get(convId);
    if (!conv) return res.status(404).json({ error: 'Not found.' });
    if (req.user.role !== 'admin' && conv.user_id !== req.user.id) {
      return res.status(403).json({ error: 'Access denied.' });
    }
    const otherRole = req.user.role === 'admin' ? 'user' : 'admin';
    MessageModel.markRead.run(convId, otherRole);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed.' });
  }
});

module.exports = router;
