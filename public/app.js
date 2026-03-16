const API_BASE = '';

const mapEl = document.getElementById('map');
const formEl = document.getElementById('report-form');
const submitBtn = document.getElementById('submit-btn');
const dateFilterEl = document.getElementById('dateFilter');
const rankingListEl = document.getElementById('ranking-list');
const applyFiltersBtn = document.getElementById('applyFilters');
const commentsCardEl = document.getElementById('comments-card');
const commentsListEl = document.getElementById('comments-list');
const commentsContextEl = document.getElementById('comments-context');
const commentFormEl = document.getElementById('comment-form');
const commentAuthorEl = document.getElementById('commentAuthor');
const commentTextEl = document.getElementById('commentText');
const commentSubmitBtn = document.getElementById('comment-submit-btn');

let map;
let markersLayer;
let selectionMarker = null;
let selectedLatLng = null;
let currentReportForComments = null;

function getSelectedSeverities() {
  const group = document.querySelectorAll('.severity-group input[type="checkbox"]');
  return Array.from(group)
    .filter((cb) => cb.checked)
    .map((cb) => cb.value);
}

function computeDateRange(filter) {
  if (filter === 'all') return {};
  const now = new Date();
  let from;

  if (filter === '24h') {
    from = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  } else if (filter === '7d') {
    from = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  } else if (filter === '30d') {
    from = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  }

  return from ? { from: from.toISOString() } : {};
}

async function fetchReports() {
  const severities = getSelectedSeverities();
  const dateFilter = dateFilterEl.value;
  const params = new URLSearchParams();

  severities.forEach((s) => params.append('severity', s));
  const { from } = computeDateRange(dateFilter);
  if (from) params.append('from', from);

  const res = await fetch(`${API_BASE}/api/reports?${params.toString()}`);
  if (!res.ok) {
    console.error('Erro ao carregar denúncias');
    return [];
  }
  const body = await res.json();
  return body.data || [];
}

async function fetchRanking() {
  const res = await fetch(`${API_BASE}/api/ranking`);
  if (!res.ok) return [];
  const body = await res.json();
  return body.data || [];
}

function severityColor(severity) {
  switch (severity) {
    case 'baixa':
      return '#38bdf8';
    case 'alta':
      return '#f97316';
    default:
      return '#facc15';
  }
}

function renderMarkers(reports) {
  markersLayer.clearLayers();

  reports.forEach((report) => {
    if (typeof report.lat !== 'number' || typeof report.lng !== 'number') return;

    const marker = L.circleMarker([report.lat, report.lng], {
      radius: 8,
      color: severityColor(report.severity),
      fillColor: severityColor(report.severity),
      fillOpacity: 0.9,
      weight: 2,
    });

    const date = new Date(report.createdAt);
    const formattedDate = date.toLocaleString('pt-BR', {
      dateStyle: 'short',
      timeStyle: 'short',
    });

    let popupHtml = `
      <strong>${report.description || 'Sem descrição'}</strong><br/>
      <small>Gravidade: ${report.severity || 'não informada'}</small><br/>
      <small>Registrado por: ${report.authorName || 'Anônimo'}</small><br/>
      <small>Data: ${formattedDate}</small>
    `;

    if (report.imageDataUrl) {
      popupHtml += `<br/><img src="${report.imageDataUrl}" alt="Foto da denúncia" style="max-width:160px; margin-top:4px; border-radius:4px;" />`;
    }

    marker.bindPopup(popupHtml);
    marker.on('click', () => {
      openCommentsPanel(report);
    });

    markersLayer.addLayer(marker);
  });
}

async function fetchComments(reportId) {
  const res = await fetch(`${API_BASE}/api/reports/${encodeURIComponent(reportId)}/comments`);
  if (!res.ok) return [];
  const body = await res.json();
  return body.data || [];
}

async function postComment(reportId, authorName, text) {
  const res = await fetch(`${API_BASE}/api/reports/${encodeURIComponent(reportId)}/comments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ authorName, text }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || 'Erro ao enviar comentário.');
  }
  const body = await res.json();
  return body.data;
}

function renderComments(comments) {
  commentsListEl.innerHTML = '';
  if (!comments.length) {
    const li = document.createElement('li');
    li.textContent = 'Ainda não há comentários para esta denúncia.';
    commentsListEl.appendChild(li);
    return;
  }

  comments.forEach((c) => {
    const li = document.createElement('li');

    const meta = document.createElement('div');
    meta.className = 'comment-meta';
    const date = new Date(c.createdAt);
    meta.innerHTML = `<span>${c.authorName || 'Anônimo'}</span><span>${date.toLocaleString('pt-BR', {
      dateStyle: 'short',
      timeStyle: 'short',
    })}</span>`;

    const text = document.createElement('div');
    text.className = 'comment-text';
    text.textContent = c.text;

    li.appendChild(meta);
    li.appendChild(text);
    commentsListEl.appendChild(li);
  });
}

async function openCommentsPanel(report) {
  currentReportForComments = report;
  commentsCardEl.classList.remove('hidden');

  const shortDesc =
    (report.description && report.description.length > 80
      ? `${report.description.slice(0, 77)}...`
      : report.description) || 'Denúncia sem descrição.';

  commentsContextEl.textContent = `Comentários para a denúncia: "${shortDesc}"`;

  try {
    const comments = await fetchComments(report.id);
    renderComments(comments);
  } catch (err) {
    console.error(err);
  }
}

function renderRanking(ranking) {
  rankingListEl.innerHTML = '';
  if (!ranking.length) {
    const li = document.createElement('li');
    li.textContent = 'Ainda não há denúncias nesta instância.';
    rankingListEl.appendChild(li);
    return;
  }

  ranking.forEach((item) => {
    const li = document.createElement('li');
    li.textContent = `${item.name} – ${item.total} denúncia(s)`;
    rankingListEl.appendChild(li);
  });
}

async function loadData() {
  try {
    const [reports, ranking] = await Promise.all([fetchReports(), fetchRanking()]);
    renderMarkers(reports);
    renderRanking(ranking);
  } catch (err) {
    console.error(err);
  }
}

function initMap() {
  // Santa Maria – RS: aproximadamente -29.6842, -53.8069
  map = L.map(mapEl).setView([-29.6842, -53.8069], 13);

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  }).addTo(map);

  markersLayer = L.layerGroup().addTo(map);

  if ('geolocation' in navigator) {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        map.setView([latitude, longitude], 14);
      },
      (err) => {
        console.warn('Não foi possível obter a localização:', err.message);
      }
    );
  }
}

function readImageAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    if (!file) return resolve(null);
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = (e) => reject(e);
    reader.readAsDataURL(file);
  });
}

async function handleSubmit(event) {
  event.preventDefault();
  submitBtn.disabled = true;
  submitBtn.textContent = 'Enviando...';

  const description = document.getElementById('description').value;
  const severity = document.getElementById('severity').value;
  const authorName = document.getElementById('authorName').value;
  const imageFile = document.getElementById('image').files[0];

  if (!selectedLatLng) {
    alert('Por favor, clique no mapa para marcar o local exato da denúncia.');
    submitBtn.disabled = false;
    submitBtn.textContent = 'Enviar denúncia';
    return;
  }

  const lat = selectedLatLng.lat;
  const lng = selectedLatLng.lng;

  try {
    const imageDataUrl = await readImageAsDataUrl(imageFile);

    const res = await fetch(`${API_BASE}/api/reports`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        description,
        severity,
        authorName,
        lat,
        lng,
        imageDataUrl,
      }),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      alert(body.error || 'Erro ao registrar denúncia. Tente novamente.');
      return;
    }

    formEl.reset();
    await loadData();
    alert('Denúncia registrada com sucesso!');
  } catch (err) {
    console.error(err);
    alert('Erro inesperado ao registrar denúncia.');
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Enviar denúncia';
  }
}

async function handleCommentSubmit(event) {
  event.preventDefault();
  if (!currentReportForComments) {
    alert('Selecione uma denúncia no mapa para comentar.');
    return;
  }

  const authorName = commentAuthorEl.value;
  const text = commentTextEl.value;

  if (!text || !text.trim()) {
    alert('Digite um comentário antes de enviar.');
    return;
  }

  commentSubmitBtn.disabled = true;
  commentSubmitBtn.textContent = 'Enviando...';

  try {
    await postComment(currentReportForComments.id, authorName, text);
    commentTextEl.value = '';

    const comments = await fetchComments(currentReportForComments.id);
    renderComments(comments);
  } catch (err) {
    console.error(err);
    alert(err.message || 'Erro ao enviar comentário.');
  } finally {
    commentSubmitBtn.disabled = false;
    commentSubmitBtn.textContent = 'Enviar comentário';
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  initMap();
  await loadData();

  map.on('click', (e) => {
    selectedLatLng = e.latlng;

    if (selectionMarker) {
      selectionMarker.setLatLng(e.latlng);
    } else {
      selectionMarker = L.marker(e.latlng, {
        draggable: true,
      }).addTo(map);

      selectionMarker.on('dragend', (ev) => {
        selectedLatLng = ev.target.getLatLng();
      });
    }
  });

  formEl.addEventListener('submit', handleSubmit);
  applyFiltersBtn.addEventListener('click', loadData);

  if (commentFormEl) {
    commentFormEl.addEventListener('submit', handleCommentSubmit);
  }

  document.querySelectorAll('.severity-group input[type="checkbox"]').forEach((cb) => {
    cb.addEventListener('change', loadData);
  });
});

