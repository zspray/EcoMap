const express = require('express');
const cors = require('cors');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json({ limit: '10mb' })); // permite imagens em base64 pequenas

// Servir frontend estático
const publicDir = path.join(__dirname, 'public');
app.use(express.static(publicDir));

// "Banco de dados" em memória (para protótipo)
const reports = [];

/**
 * Normaliza e valida uma denúncia recebida.
 */
function buildReport(payload) {
  const now = new Date();
  return {
    id: uuidv4(),
    description: payload.description?.trim() || 'Sem descrição',
    severity: payload.severity || 'media', // baixa, media, alta
    authorName: payload.authorName?.trim() || 'Anônimo',
    lat: typeof payload.lat === 'number' ? payload.lat : null,
    lng: typeof payload.lng === 'number' ? payload.lng : null,
    imageDataUrl: payload.imageDataUrl || null, // base64 opcional
    createdAt: now.toISOString(),
    comments: []
  };
}

/**
 * GET /api/reports
 * Filtros opcionais: severity, from (ISO), to (ISO)
 */
app.get('/api/reports', (req, res) => {
  const { severity, from, to } = req.query;

  let filtered = [...reports];

  if (severity) {
    const severities = Array.isArray(severity) ? severity : [severity];
    filtered = filtered.filter(r => severities.includes(r.severity));
  }

  if (from) {
    const fromDate = new Date(from);
    if (!isNaN(fromDate)) {
      filtered = filtered.filter(r => new Date(r.createdAt) >= fromDate);
    }
  }

  if (to) {
    const toDate = new Date(to);
    if (!isNaN(toDate)) {
      filtered = filtered.filter(r => new Date(r.createdAt) <= toDate);
    }
  }

  res.json({ data: filtered });
});

/**
 * POST /api/reports
 * Body: { description, severity, authorName, lat, lng, imageDataUrl }
 */
app.post('/api/reports', (req, res) => {
  const { description, severity, authorName, lat, lng, imageDataUrl } = req.body || {};

  if (typeof lat !== 'number' || typeof lng !== 'number') {
    return res.status(400).json({ error: 'Localização inválida.' });
  }

  const report = buildReport({ description, severity, authorName, lat, lng, imageDataUrl });
  reports.push(report);

  res.status(201).json({ data: report });
});

/**
 * Comentários por denúncia
 * GET /api/reports/:id/comments
 * POST /api/reports/:id/comments
 */
app.get('/api/reports/:id/comments', (req, res) => {
  const { id } = req.params;
  const report = reports.find(r => r.id === id);
  if (!report) {
    return res.status(404).json({ error: 'Denúncia não encontrada.' });
  }
  res.json({ data: report.comments || [] });
});

app.post('/api/reports/:id/comments', (req, res) => {
  const { id } = req.params;
  const { authorName, text } = req.body || {};

  const report = reports.find(r => r.id === id);
  if (!report) {
    return res.status(404).json({ error: 'Denúncia não encontrada.' });
  }

  if (!text || !text.trim()) {
    return res.status(400).json({ error: 'O comentário não pode ser vazio.' });
  }

  const now = new Date();
  const comment = {
    id: uuidv4(),
    authorName: authorName?.trim() || 'Anônimo',
    text: text.trim(),
    createdAt: now.toISOString()
  };

  if (!Array.isArray(report.comments)) {
    report.comments = [];
  }
  report.comments.push(comment);

  res.status(201).json({ data: comment });
});

/**
 * Endpoint simples para ranking de usuários (por quantidade de denúncias).
 */
app.get('/api/ranking', (req, res) => {
  const counts = {};
  for (const report of reports) {
    const key = report.authorName || 'Anônimo';
    counts[key] = (counts[key] || 0) + 1;
  }

  const ranking = Object.entries(counts)
    .map(([name, total]) => ({ name, total }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 10);

  res.json({ data: ranking });
});

app.listen(PORT, () => {
  console.log(`EcoMap rodando em http://localhost:${PORT}`);
});

