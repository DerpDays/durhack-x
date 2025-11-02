import nacl from 'https://cdn.jsdelivr.net/npm/tweetnacl@1.0.3/+esm';

const DEFAULT_API = 'http://127.0.0.1:8081';

let mortalityModel = defaultMortalityModelClient();
let apiBase = localStorage.getItem('seer_api_base') || DEFAULT_API;
let activeTask = null;
let activePreview = null;
const registeredWorkers = new Set();

const encoder = new TextEncoder();
const keypair = loadOrCreateKeypair();
const CAPABILITIES = ['math:basic', 'math:advanced', 'analytics:vector', 'script:sandbox'];

const elements = {
  apiInput: document.querySelector('#api-base'),
  connectBtn: document.querySelector('#connect-btn'),
  apiStatus: document.querySelector('#api-status'),
  fateForm: document.querySelector('#fate-form'),
  fateResult: document.querySelector('#fate-result'),
  requestForm: document.querySelector('#request-form'),
  requestResult: document.querySelector('#request-result'),
  assistForm: document.querySelector('#assist-form'),
  assistResult: document.querySelector('#assist-result'),
  assistPreview: document.querySelector('#assist-preview'),
  submitForm: document.querySelector('#submit-form'),
};

init();

function init() {
  if (elements.apiInput) {
    elements.apiInput.value = apiBase;
  }
  updateApiStatus('Idle — not connected');
  elements.submitForm?.classList.add('hidden');
  elements.assistPreview?.classList.add('hidden');

  elements.connectBtn?.addEventListener('click', connectToCoordinator);
  elements.apiInput?.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      connectToCoordinator();
    }
  });

  elements.fateForm?.addEventListener('submit', handleFate);
  elements.requestForm?.addEventListener('submit', handleRequestAid);
  elements.assistForm?.addEventListener('submit', handleFetchTask);
  elements.submitForm?.addEventListener('submit', handleSubmitResult);
}

function updateApiStatus(message, success = false) {
  if (!elements.apiStatus) return;
  elements.apiStatus.textContent = message;
  elements.apiStatus.style.color = success ? '#6af7c7' : '#c9ccdd';
}

async function connectToCoordinator() {
  const value = elements.apiInput?.value?.trim();
  if (!value) {
    updateApiStatus('Please enter a coordinator URL');
    return;
  }
  try {
    const normalized = normalizeUrl(value);
    apiBase = normalized;
    localStorage.setItem('seer_api_base', apiBase);
    updateApiStatus('Connecting…');
    await fetch(`${apiBase}/tasks_overview`, { method: 'GET' });
    await loadRemoteModel();
    updateApiStatus(`Connected to ${apiBase}`, true);
    showToast('Seer aligned with coordinator realm.');
  } catch (err) {
    console.error(err);
    updateApiStatus(`Connection failed: ${err.message}`);
    showToast(`Connection failed: ${err.message}`, true);
  }
}

async function loadRemoteModel() {
  try {
    const res = await fetch(`${apiBase}/seer/model`, { method: 'GET' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    mortalityModel = normaliseModelPayload(data);
    console.info('Loaded mortality model from coordinator');
  } catch (err) {
    console.warn('Falling back to local mortality model:', err.message);
    mortalityModel = normaliseModelPayload(mortalityModel);
  }
}

async function handleFate(event) {
  event.preventDefault();
  const payload = {
    age: Number(document.querySelector('#age').value),
    city: document.querySelector('#city').value.trim(),
    country: document.querySelector('#country').value.trim(),
    ethnicity: document.querySelector('#ethnicity').value.trim(),
  };
  elements.fateResult.innerHTML = 'Consulting destiny…';
  try {
    const res = await fetch(`${apiBase}/seer/predict`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    renderFate(data);
  } catch (err) {
    console.error(err);
    const fallback = localFateFallback(payload);
    renderFate(fallback);
    showToast(`Remote augury failed, using local omen (${err.message})`, true);
  }
}

function renderFate(data) {
  const { prediction, yearsRemaining, riskScore, advisory, reason } = data;
  elements.fateResult.innerHTML = `
    <p><span class="highlight">${prediction}</span></p>
    <p>Estimated years remaining: <span class="highlight">${yearsRemaining}</span></p>
    <p>Risk index: <span class="highlight">${(riskScore * 100).toFixed(1)}%</span></p>
    <p>Probable cause: <span class="highlight">${reason || 'Veiled by mist'}</span></p>
    <p>${advisory}</p>
  `;
}

async function handleRequestAid(event) {
  event.preventDefault();
  const operation = document.querySelector('#job-title').value.trim();
  const inputValue = Number(document.querySelector('#job-input').value);
  const price = Number(document.querySelector('#job-bounty').value || 0);
  let payload = {};
  const payloadText = document.querySelector('#job-payload').value.trim();
  if (payloadText) {
    try {
      payload = JSON.parse(payloadText);
    } catch (err) {
      elements.requestResult.innerHTML = `<p class="warning">Invalid JSON payload: ${err.message}</p>`;
      return;
    }
  }
  const body = {
    operation,
    input: inputValue,
    price,
    kind: operation === 'script_eval' ? 'script' : 'custom',
    payload,
    required_capabilities: inferCapabilities(operation),
  };
  elements.requestResult.innerHTML = 'Dispatching request…';
  try {
    await ensureWorker('seer-requester');
    const res = await fetch(`${apiBase}/create_task`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(await res.text());
    const data = await res.json();
    elements.requestResult.innerHTML = `<p class="highlight">Task ${data.id} registered with bounty ${price} tokens.</p>`;
    showToast(`Task ${data.id} added to the queue.`);
  } catch (err) {
    console.error(err);
    elements.requestResult.innerHTML = `<p class="warning">Request failed: ${err.message}</p>`;
    showToast(`Failed to register job: ${err.message}`, true);
  }
}

async function handleFetchTask(event) {
  event.preventDefault();
  const worker = document.querySelector('#worker-name').value.trim();
  if (!worker) {
    elements.assistResult.innerHTML = '<p class="warning">Name yourself before aiding the Seer.</p>';
    return;
  }
  elements.assistResult.innerHTML = 'Seeking a task…';
  elements.submitForm.classList.add('hidden');
  try {
    await ensureWorker(worker);
    const res = await fetch(`${apiBase}/get_task`, {
      method: 'GET',
      headers: { 'X-Worker-Id': worker },
    });
    if (res.status === 204) {
      elements.assistResult.innerHTML = '<p>No task currently available. Check back soon.</p>';
      activeTask = null;
      return;
    }
    if (!res.ok) throw new Error(await res.text());
    const task = await res.json();
    activeTask = task;
    const preview = autoSolveTask(task);
    activePreview = preview;
    elements.assistResult.innerHTML = `
      <p><span class="highlight">Task ${task.id}</span></p>
      <p>Operation: ${task.operation}</p>
      <p>Input: ${task.input}</p>
      <p>Bounty: ${task.price ?? 0} tokens</p>
    `;
    if (elements.assistPreview) {
      elements.assistPreview.innerHTML = `
        <p>Auto-computed output: <span class="highlight">${preview.output}</span></p>
        <p>${preview.explanation}</p>
      `;
      elements.assistPreview.classList.remove('hidden');
    }
    elements.submitForm.classList.remove('hidden');
    showToast(`Task ${task.id} claimed. Review the output and submit.`);
  } catch (err) {
    console.error(err);
    elements.assistResult.innerHTML = `<p class="warning">Failed to fetch task: ${err.message}</p>`;
    elements.assistPreview?.classList.add('hidden');
    activePreview = null;
    activeTask = null;
  }
}

async function handleSubmitResult(event) {
  event.preventDefault();
  if (!activeTask) {
    elements.assistResult.innerHTML = '<p class="warning">No active task claimed.</p>';
    return;
  }
  const worker = document.querySelector('#worker-name').value.trim();
  const outputValue = activePreview ? activePreview.output : Number(activeTask.input);
  elements.assistResult.innerHTML = 'Sending result…';
  try {
    await ensureWorker(worker);
    const messageBytes = encoder.encode(JSON.stringify({
      id: activeTask.id,
      worker,
      output: outputValue,
    }));
    const signatureBytes = nacl.sign.detached(messageBytes, keypair.secretKey);
    const resultPayload = {
      id: activeTask.id,
      worker,
      output: outputValue,
      signature: toBase64(signatureBytes),
      pub_key: toBase64(keypair.publicKey),
      kind: activeTask.kind,
      payload: activeTask.payload,
    };
    const res = await fetch(`${apiBase}/submit_result`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(resultPayload),
    });
    if (!res.ok) throw new Error(await res.text());
    elements.assistResult.innerHTML = `<p class="highlight">Result submitted. The Seer thanks you.</p>`;
    elements.submitForm.classList.add('hidden');
    elements.assistPreview?.classList.add('hidden');
    activeTask = null;
    activePreview = null;
    showToast('Result accepted. Trust will follow.');
  } catch (err) {
    console.error(err);
    elements.assistResult.innerHTML = `<p class="warning">Failed to submit result: ${err.message}</p>`;
  }
}

function inferCapabilities(operation) {
  if (operation === 'script_eval') return ['script:sandbox'];
  if (operation === 'vector_sum') return ['analytics:vector'];
  if (operation === 'factorial') return ['math:advanced'];
  return ['math:basic'];
}

function normalizeUrl(url) {
  let value = url.trim();
  if (!/^https?:\/\//i.test(value)) {
    value = `http://${value}`;
  }
  const parsed = new URL(value);
  return parsed.href.replace(/\/$/, '');
}

function showToast(message, isError = false) {
  let toast = document.querySelector('.toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.className = 'toast';
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.classList.toggle('error', isError);
  toast.classList.add('visible');
  clearTimeout(showToast._timer);
  showToast._timer = setTimeout(() => toast.classList.remove('visible'), 4200);
}

async function ensureWorker(workerId) {
  if (registeredWorkers.has(workerId)) return;
  const body = {
    worker_id: workerId,
    pub_key: toBase64(keypair.publicKey),
    capabilities: CAPABILITIES,
  };
  const res = await fetch(`${apiBase}/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`Failed to register: ${await res.text()}`);
  }
  registeredWorkers.add(workerId);
}

function autoSolveTask(task) {
  const operation = task.operation || '';
  const input = Number(task.input);
  switch (operation) {
    case 'square':
      return { output: input * input, explanation: `Auto-solved: ${input}² = ${(input * input).toFixed(3)}` };
    case 'sqrt':
      return { output: Math.sqrt(Math.max(input, 0)), explanation: `Auto-solved square root.` };
    case 'double':
      return { output: input * 2, explanation: `Auto-solved: doubled the input.` };
    case 'factorial': {
      let acc = 1;
      const n = Math.max(0, Math.floor(input));
      for (let i = 2; i <= n; i += 1) acc *= i;
      return { output: acc, explanation: `Auto-solved factorial of ${n}.` };
    }
    case 'vector_sum': {
      try {
        const payload = task.payload ? JSON.parse(task.payload) : {};
        const values = Array.isArray(payload.values) ? payload.values.map(Number) : [];
        const sum = values.reduce((acc, val) => acc + val, 0);
        return { output: sum, explanation: `Auto-solved vector sum of ${values.length} values.` };
      } catch (err) {
        console.error(err);
      }
      break;
    }
    case 'script_eval': {
      try {
        const payload = task.payload ? JSON.parse(task.payload) : {};
        if (payload.source) {
          const result = evaluateScriptSnippet(payload.source);
          return { output: result.output, explanation: `Auto-solved script: ${payload.source}` };
        }
      } catch (err) {
        console.error(err);
      }
      break;
    }
    default:
      break;
  }
  return { output: input, explanation: 'Unknown operation — please compute manually.' };
}

function evaluateScriptSnippet(source) {
  const trimmed = String(source).trim();
  const match = trimmed.match(/^print\s*\((.*)\)\s*$/i);
  if (!match) {
    throw new Error('Only print(expression) scripts supported');
  }
  const expression = match[1];
  if (!/^[0-9+\-*/%.()\s]+$/.test(expression)) {
    throw new Error('Expression contains unsupported characters');
  }
  const fn = new Function(`return (${expression});`);
  const value = Number(fn());
  if (!Number.isFinite(value)) {
    throw new Error('Expression did not produce a finite number');
  }
  return {
    output: value,
    metadata: {
      expression: expression.trim(),
      source: trimmed,
    },
  };
}

function localFateFallback({ age, city = '', country = '', ethnicity = '' }) {
  const result = runMortalityModelClient(age, city, country, ethnicity);
  const prediction = result.risk > 0.65
    ? 'A storm gathers sooner than expected.'
    : result.risk > 0.45
      ? 'Fate balances on a knife-edge.'
      : 'The threads favour a long life.';
  const advisory = result.risk > 0.65
    ? 'Adopt healthier routines and lean on your community.'
    : result.risk > 0.45
      ? 'Moderate stressors and nurture trusted alliances.'
      : 'Share compute generously; good karma increases longevity.';
  return {
    prediction,
    yearsRemaining: result.yearsRemaining,
    riskScore: result.risk,
    advisory,
    reason: result.reason,
  };
}

function runMortalityModelClient(age, city, country, ethnicity) {
  let score = mortalityModel.intercept + mortalityModel.age * age + mortalityModel.ageSq * age * age;
  const contributions = {};
  const lowerCity = (city || '').trim().toLowerCase();
  if (mortalityModel.city[lowerCity]) {
    score += mortalityModel.city[lowerCity];
    contributions[lowerCity] = mortalityModel.city[lowerCity];
  }
  const lowerCountry = (country || '').trim().toLowerCase();
  if (mortalityModel.country[lowerCountry]) {
    score += mortalityModel.country[lowerCountry];
    contributions[lowerCountry] = mortalityModel.country[lowerCountry];
  }
  const lowerEth = (ethnicity || '').trim().toLowerCase();
  Object.entries(mortalityModel.ethnicity).forEach(([key, coef]) => {
    if (lowerEth.includes(key)) {
      score += coef;
      contributions[key] = coef;
    }
  });
  const risk = clamp01(1 / (1 + Math.exp(-score)));
  const yearsRemaining = Math.max(5, Math.round(95 - age - risk * 12));
  const causeKey = selectCauseClient(contributions);
  const reason = mortalityModel.cause[causeKey] || mortalityModel.cause.default;
  return { risk, yearsRemaining, reason };
}

function selectCauseClient(contributions) {
  let maxKey = '';
  let maxVal = 0;
  for (const [key, val] of Object.entries(contributions)) {
    if (val > maxVal && mortalityModel.cause[key]) {
      maxVal = val;
      maxKey = key;
    }
  }
  return maxKey || 'default';
}

function loadOrCreateKeypair() {
  const stored = localStorage.getItem('seer_ed25519');
  if (stored) {
    try {
      const parsed = JSON.parse(stored);
      return {
        publicKey: fromBase64(parsed.publicKey),
        secretKey: fromBase64(parsed.secretKey),
      };
    } catch (err) {
      console.warn('Failed to parse stored keypair, regenerating', err);
    }
  }
  const generated = nacl.sign.keyPair();
  localStorage.setItem(
    'seer_ed25519',
    JSON.stringify({
      publicKey: toBase64(generated.publicKey),
      secretKey: toBase64(generated.secretKey),
    })
  );
  return generated;
}

function toBase64(bytes) {
  let binary = '';
  bytes = new Uint8Array(bytes);
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function fromBase64(str) {
  const binary = atob(str);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function clamp01(v) {
  if (v < 0) return 0;
  if (v > 1) return 1;
  return v;
}

function defaultMortalityModelClient() {
  return {
    intercept: -6.35,
    age: 0.072,
    ageSq: -0.00028,
    city: {
      'new york': 0.48,
      'los angeles': 0.32,
      mumbai: 0.55,
      delhi: 0.58,
      tokyo: -0.42,
      osaka: -0.35,
      london: 0.12,
      lagos: 0.61,
      jakarta: 0.44,
      sydney: -0.28,
    },
    country: {
      'united states': 0.32,
      india: 0.41,
      nigeria: 0.63,
      indonesia: 0.47,
      japan: -0.48,
      australia: -0.36,
      'united kingdom': 0.18,
      canada: -0.22,
      germany: -0.19,
      brazil: 0.29,
    },
    ethnicity: {
      smoker: 0.58,
      diabetes: 0.46,
      hypertension: 0.37,
      athlete: -0.32,
      vegan: -0.21,
    },
    cause: {
      smoker: 'Respiratory failure from chronic exposure to toxins.',
      diabetes: 'Organ failure due to uncontrolled diabetes.',
      hypertension: 'Hypertensive crisis leading to stroke.',
      mumbai: 'Vector-borne disease outbreak in dense urban settlement.',
      delhi: 'Air-quality driven respiratory collapse.',
      lagos: 'Water-borne infection during seasonal floods.',
      tokyo: 'Peaceful passing in a low-risk environment.',
      japan: 'Natural causes after an extended life expectancy.',
      default: 'Systemic infection following prolonged stress.',
    },
  };
}

function normaliseModelPayload(payload) {
  if (!payload) return defaultMortalityModelClient();
  const normalised = {
    intercept: Number(payload.intercept ?? 0),
    age: Number(payload.age ?? 0),
    ageSq: Number(payload.age_sq ?? payload.ageSq ?? 0),
    city: {},
    country: {},
    ethnicity: {},
    cause: {},
  };
  for (const [k, v] of Object.entries(payload.city || {})) {
    normalised.city[k.toLowerCase()] = Number(v);
  }
  for (const [k, v] of Object.entries(payload.country || {})) {
    normalised.country[k.toLowerCase()] = Number(v);
  }
  for (const [k, v] of Object.entries(payload.ethnicity || {})) {
    normalised.ethnicity[k.toLowerCase()] = Number(v);
  }
  for (const [k, v] of Object.entries(payload.cause || payload.cause_map || {})) {
    normalised.cause[k.toLowerCase()] = String(v);
  }
  if (!normalised.cause.default) {
    normalised.cause.default = 'Systemic infection following prolonged stress.';
  }
  return normalised;
}
