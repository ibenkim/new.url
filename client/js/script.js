const form = document.getElementById('shorten-form');
const urlInput = document.getElementById('url-input');
const aliasInput = document.getElementById('alias-input');
const aiBtn = document.getElementById('ai-btn');
const submitBtn = document.getElementById('submit-btn');
const resultSection = document.getElementById('result-section');
const shortUrlInput = document.getElementById('short-url');
const qrImage = document.getElementById('qr-image');
const copyBtn = document.getElementById('copy-btn');

// Constants
const API_BASE = window.location.origin.includes('localhost')
    ? 'http://localhost:3000/api'
    : '/api'; // Adjust for production deployment if needed

// AI Suggestion Handler
aiBtn.addEventListener('click', async () => {
    const url = urlInput.value.trim();
    if (!url) {
        alert('Please enter a URL first!');
        return;
    }

    // Visual feedback
    aiBtn.classList.add('loading');
    const originalContent = aiBtn.innerHTML;
    aiBtn.innerHTML = '...';

    try {
        const res = await fetch(`${API_BASE}/suggest?url=${encodeURIComponent(url)}`);
        const data = await res.json();

        if (data.suggestion) {
            aliasInput.value = data.suggestion;
            aliasInput.focus();
        }
    } catch (err) {
        console.error('Failed to get suggestion:', err);
        // Fallback or silent fail
    } finally {
        aiBtn.classList.remove('loading');
        aiBtn.innerHTML = originalContent;
    }
});

// Form Submit Handler
form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const url = urlInput.value.trim();
    const alias = aliasInput.value.trim();

    if (!url) return;

    // Loading State
    submitBtn.disabled = true;
    submitBtn.textContent = 'Shortening...';

    try {
        const res = await fetch(`${API_BASE}/shorten`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url, alias })
        });

        const data = await res.json();

        if (!res.ok) {
            throw new Error(data.error || 'Something went wrong');
        }

        // Show Results
        displayResult(data);

    } catch (err) {
        alert(err.message);
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Shorten URL';
    }
});

function displayResult(data) {
    shortUrlInput.value = data.shortUrl;
    qrImage.src = data.qrCode;

    resultSection.classList.add('visible');

    // Smooth scroll to result
    resultSection.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

// Copy to Clipboard
copyBtn.addEventListener('click', () => {
    shortUrlInput.select();
    document.execCommand('copy'); // Fallback for older browsers

    // Modern approach
    if (navigator.clipboard) {
        navigator.clipboard.writeText(shortUrlInput.value);
    }

    const originalText = copyBtn.textContent;
    copyBtn.textContent = 'Copied!';
    setTimeout(() => {
        copyBtn.textContent = originalText;
    }, 2000);
});
