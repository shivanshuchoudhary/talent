/**
 * Microsoft SSO for the bundled dashboard.
 * The button lives in the HTML template; this script only wires behaviour.
 */
(function () {
  'use strict';

  function clearSsoSession() {
    ['sobha_token', 'sobha_user_v5', 'sobha_user', 'sobha_identity'].forEach(function (key) {
      sessionStorage.removeItem(key);
    });
  }

  function resetSsoButton() {
    const ssoBtn = document.getElementById('microsoftSSOBtn');
    if (!ssoBtn) return;
    ssoBtn.disabled = false;
    ssoBtn.dataset.busy = '0';
  }

  async function startMicrosoftSSO() {
    const ssoBtn = document.getElementById('microsoftSSOBtn');
    if (ssoBtn && ssoBtn.dataset.busy === '1') return;
    if (ssoBtn) {
      ssoBtn.dataset.busy = '1';
      ssoBtn.disabled = true;
    }
    try {
      const res = await fetch('/api/v1/auth/microsoft/login', {
        method: 'GET',
        credentials: 'same-origin',
        headers: { Accept: 'application/json' },
      });
      if (!res.ok) throw new Error('Request failed (' + res.status + ')');
      const data = await res.json();
      if (!data || !data.auth_url) throw new Error('Missing Microsoft auth URL');
      window.location.href = data.auth_url;
    } catch (err) {
      const msg = err && err.message ? err.message : 'Unable to start Microsoft login';
      const el = document.getElementById('loginErr');
      if (el) {
        el.textContent = 'Microsoft login failed: ' + msg;
        el.classList.add('show');
      } else {
        alert('Microsoft login failed: ' + msg);
      }
      resetSsoButton();
    }
  }

  function bindMicrosoftSSOClickHandler() {
    if (window.__sobhaMicrosoftSSOBound) return;
    window.__sobhaMicrosoftSSOBound = true;

    document.addEventListener(
      'click',
      function (event) {
        const btn =
          event.target && event.target.closest
            ? event.target.closest('#microsoftSSOBtn,[data-microsoft-sso="1"]')
            : null;
        if (!btn) return;
        event.preventDefault();
        event.stopPropagation();
        startMicrosoftSSO();
      },
      true
    );
  }

  function onReturnToLoginScreen() {
    clearSsoSession();
    resetSsoButton();
    const err = document.getElementById('loginErr');
    if (err) err.classList.remove('show');
  }

  function patchBundledLogout() {
    if (typeof window.doLogout !== 'function') return false;
    if (window.doLogout.__ssoPatched) return true;

    const original = window.doLogout;
    window.doLogout = function patchedLogout() {
      original.apply(this, arguments);
      onReturnToLoginScreen();
    };
    window.doLogout.__ssoPatched = true;
    return true;
  }

  function initMicrosoftSSO() {
    bindMicrosoftSSOClickHandler();
    patchBundledLogout();

    let patchAttempts = 0;
    const patchTimer = window.setInterval(function () {
      patchAttempts += 1;
      if (patchBundledLogout() || patchAttempts >= 60) {
        window.clearInterval(patchTimer);
      }
    }, 250);
  }

  window.sobhaInitMicrosoftSSO = initMicrosoftSSO;
  window.sobhaReinjectMicrosoftSSO = onReturnToLoginScreen;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initMicrosoftSSO);
  } else {
    initMicrosoftSSO();
  }
})();
