/* Single source of truth for build display and auto-refresh of already-open tabs. */
(() => {
  /* A deployment address is frozen at the build it was made from. Opening one
   * looks exactly like "the site is stuck on an old version", and no refresh
   * can fix it, because that URL will serve that build for ever. So any
   * <id>.indusmova.pages.dev visit is sent to the canonical domain, keeping
   * the path and the fragment. */
  const host = location.hostname;
  if (/^[0-9a-f]{8}\.indusmova\.pages\.dev$/i.test(host)) {
    location.replace(`https://indusmova.pages.dev${location.pathname}${location.search}${location.hash}`);
    return;
  }

  const meta = document.querySelector('meta[name="indusmova-build"]');
  const versionMeta = document.querySelector('meta[name="indusmova-version"]');
  const pageBuild = String(meta?.content || versionMeta?.content || '').trim();
  let checking = false;
  let updating = false;

  function paintBuild(info) {
    const versionEl = document.getElementById('appVersion');
    const buildEl = document.getElementById('appBuild');
    const commit = String(info.commit || '').slice(0, 7);
    if (versionEl && info.version) versionEl.textContent = `v${info.version}${commit ? `+${commit}` : ''}`;
    if (buildEl) {
      buildEl.textContent = info.built ? `· ${new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(info.built))}` : '';
      buildEl.title = info.built ? `Built ${info.built}` : '';
    }
  }

  function showUpdateNotice() {
    let note = document.getElementById('indusmova-build-update');
    if (note) return;
    note = document.createElement('div');
    note.id = 'indusmova-build-update';
    note.setAttribute('role', 'status');
    note.setAttribute('aria-live', 'polite');
    note.style.cssText = 'position:fixed;inset:auto 12px 12px 12px;z-index:99999;padding:12px 16px;border-radius:12px;background:#173b32;color:#fff;font:600 13px system-ui;box-shadow:0 8px 28px #0005;display:flex;align-items:center;gap:12px;justify-content:space-between';
    const label = document.createElement('span');
    label.textContent = 'A newer version is available. Refresh this page to update.';
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = 'Refresh now';
    button.style.cssText = 'border:1px solid #ffffff80;border-radius:8px;padding:6px 10px;background:transparent;color:#fff;font:inherit;cursor:pointer';
    button.addEventListener('click', () => window.location.reload());
    note.append(label, button);
    document.body.append(note);
  }

  async function checkForUpdate() {
    if (checking || updating || document.visibilityState === 'hidden') return;
    checking = true;
    try {
      const response = await fetch(`/assets/version.json?check=${Date.now()}`, { cache: 'no-store' });
      if (!response.ok) return;
      const info = await response.json();
      if (!info?.version) return;
      paintBuild(info);
      const commit = String(info.commit || '').slice(0, 7);
      const remoteBuild = `${info.version}${commit ? `-${commit}` : ''}`;
      if (pageBuild === remoteBuild || pageBuild === String(info.version)) return;

      // Only auto-reload once for a particular build. If an edge still returns
      // stale HTML after reload, leave a manual refresh control instead of looping.
      const sessionKey = `indusmova:reload-for:${remoteBuild}`;
      try {
        if (sessionStorage.getItem(sessionKey) === 'done') {
          showUpdateNotice();
          return;
        }
        sessionStorage.setItem(sessionKey, 'done');
      } catch {
        // If this browser blocks sessionStorage, do not auto-reload: a reload
        // would lose the guard and could loop while an edge serves stale HTML.
        showUpdateNotice();
        return;
      }
      updating = true;
      showUpdateNotice();
      window.setTimeout(() => window.location.reload(), 900);
    } catch {
      // Offline or version endpoint temporarily unavailable; retry later.
    } finally {
      checking = false;
    }
  }

  checkForUpdate();
  window.setInterval(checkForUpdate, 60_000);
  window.addEventListener('focus', checkForUpdate);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') checkForUpdate();
  });
})();
