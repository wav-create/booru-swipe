// The swipe feed: one full-screen <section> per video. Handles loading and
// unloading videos, autoplay, the timing rules, taps and double-taps.
import { getPlayWindow } from './timing.js';

export class Feed {
  // hooks = { getSettings, onCurrentChange(post), onNearEnd(), onProgress(cur, dur),
  //           onDoubleTap(post), onUnlock() }
  constructor(root, hooks) {
    this.root = root;
    this.hooks = hooks;
    this.items = [];          // { post, slide, i, video, win, playedOnce, userPaused }
    this.index = -1;          // which video is on screen
    this.unlocked = false;    // has the user touched the page yet? (needed for sound)
    this.justUnlocked = false;
    this.scrubbing = false;   // true while dragging the seek bar
    this.lastTap = 0;
    this.tapTimer = 0;

    // Watches which slide is mostly on screen
    this.io = new IntersectionObserver((entries) => {
      for (const e of entries) if (e.isIntersecting) this.setCurrent(Number(e.target.dataset.i));
    }, { root: this.root, threshold: 0.6 });

    root.addEventListener('click', (e) => this.onClick(e));
    window.addEventListener('pointerdown', () => this.unlock(), { once: true, capture: true });
    document.addEventListener('visibilitychange', () => this.onVisibility());
    window.addEventListener('resize', () => this.snapToCurrent());   // rotation
    this.tick = this.tick.bind(this);
    requestAnimationFrame(this.tick);
  }

  count() { return this.items.length; }
  getCurrent() { const it = this.items[this.index]; return it ? it.post : null; }
  currentVideo() { const it = this.items[this.index]; return it ? it.video : null; }

  clear() {
    this.io.disconnect();
    this.items.forEach((_, i) => this.unmount(i));
    this.items = [];
    this.index = -1;
    this.root.innerHTML = '';
    this.root.scrollTop = 0;
  }

  add(posts) {
    for (const post of posts) {
      const i = this.items.length;
      const slide = document.createElement('section');
      slide.className = 'slide';
      slide.dataset.i = i;
      slide.innerHTML =
        '<div class="pause-icon">▶</div>' +
        '<div class="slide-error"><p>This video failed to load.</p><div>' +
        '<button data-act="retry">Try again</button><button data-act="skip">Skip</button></div></div>';
      this.root.appendChild(slide);
      this.io.observe(slide);
      this.items.push({ post, slide, i, video: null, win: null, playedOnce: false, userPaused: false });
    }
    if (this.index >= 0) this.updateWindow();
  }

  scrollToIndex(i) {
    const it = this.items[i];
    if (it) it.slide.scrollIntoView({ block: 'start' });
  }
  snapToCurrent() { this.scrollToIndex(this.index); }
  next() {
    const n = this.items[this.index + 1];
    if (n) n.slide.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // ---------- Loading / unloading videos (keeps memory sane) ----------
  // Only videos from 1 before to 2 after the current one exist as <video> elements.
  mount(i) {
    const it = this.items[i];
    if (!it || it.video) return;
    const s = this.hooks.getSettings();
    const v = document.createElement('video');
    v.playsInline = true;
    v.setAttribute('playsinline', '');
    v.muted = true;
    v.loop = false;                       // we handle looping ourselves (timing rules)
    v.preload = 'metadata';
    v.disablePictureInPicture = true;
    if (it.post.posterUrl) v.poster = it.post.posterUrl;
    v.src = (s.dataSaver && it.post.saverUrl) ? it.post.saverUrl : it.post.url;

    v.addEventListener('loadedmetadata', () => { if (it.video === v) this.onMeta(it); });
    v.addEventListener('waiting', () => { if (it.video === v) it.slide.classList.add('loading'); });
    v.addEventListener('canplay', () => { if (it.video === v) it.slide.classList.remove('loading'); });
    v.addEventListener('playing', () => {
      if (it.video === v) it.slide.classList.remove('loading', 'failed');
    });
    v.addEventListener('ended', () => { if (it.video === v) this.handleEnd(it); });
    v.addEventListener('error', () => {
      if (it.video !== v) return;
      it.slide.classList.remove('loading');
      it.slide.classList.add('failed');
    });

    it.slide.prepend(v);
    it.video = v;
    it.slide.classList.add('loading');
  }

  unmount(i) {
    const it = this.items[i];
    if (!it || !it.video) return;
    const v = it.video;
    it.video = null;
    it.win = null;
    v.pause();
    v.removeAttribute('src');
    v.load();          // tells the browser to release the video's memory
    v.remove();
    it.slide.classList.remove('loading', 'failed');
  }

  updateWindow() {
    const lo = this.index - 1, hi = this.index + 2;
    const saver = this.hooks.getSettings().dataSaver;
    this.items.forEach((it, i) => {
      if (i >= lo && i <= hi) {
        this.mount(i);
        if (it.video) {
          it.video.preload = (i === this.index || (i === this.index + 1 && !saver)) ? 'auto' : 'metadata';
        }
      } else {
        this.unmount(i);
      }
    });
  }

  // ---------- Which video is current ----------
  setCurrent(i) {
    if (i === this.index || !this.items[i]) return;
    const prev = this.items[this.index];
    if (prev && prev.video) prev.video.pause();
    this.index = i;
    this.updateWindow();
    const it = this.items[i];
    it.userPaused = false;
    // Coming back to a video we already watched: restart it at its start point
    if (it.video && it.win && it.playedOnce) it.video.currentTime = it.win.start;
    this.playCurrent();
    this.hooks.onCurrentChange(it.post);
    if (this.items.length - i <= 5) this.hooks.onNearEnd();   // load more soon
  }

  // The timing rules are applied here, as soon as we know the video's length
  onMeta(it) {
    const v = it.video;
    if (isFinite(v.duration) && v.duration > 0) {
      it.win = getPlayWindow(v.duration, it.post, this.hooks.getSettings());
      if (it.win.start > 0) v.currentTime = it.win.start;          // rule 1 (start at 15%)
    }
    if (this.items[this.index] === it) this.playCurrent();
  }

  playCurrent() {
    const it = this.items[this.index];
    if (!it || !it.video) return;
    const v = it.video;
    if (v.readyState < 1) return;        // not ready: onMeta() will call us again
    const s = this.hooks.getSettings();
    if (it.win) it.win = getPlayWindow(v.duration, it.post, s);    // pick up settings changes
    this.applyAudio(v);
    v.playbackRate = s.speed;
    const p = v.play();
    if (p) {
      p.catch((err) => {
        if (err && err.name === 'NotAllowedError') {          // browser refused sound
          v.muted = true;
          v.play().catch(() => {});
        }
      });
    }
    it.playedOnce = true;
  }

  // ---------- Reaching the end (rule 2 lives in timing.js; this just acts on it) ----------
  handleEnd(it) {
    if (this.items[this.index] !== it || !it.video) return;
    const now = performance.now();
    if (now - (it.lastEnd || 0) < 800) return;       // don't fire twice
    it.lastEnd = now;
    const hasNext = this.index < this.items.length - 1;
    if (this.hooks.getSettings().loop || !hasNext) {
      it.video.currentTime = it.win ? it.win.start : 0;
      it.video.play().catch(() => {});
    } else {
      this.next();
    }
  }

  // Runs ~60 times a second: updates the seek bar and spots the "end" point
  tick() {
    const it = this.items[this.index];
    if (it && it.video && it.win && !this.scrubbing) {
      const v = it.video;
      this.hooks.onProgress(v.currentTime, v.duration);
      if (!v.paused && v.currentTime >= it.win.end - 0.05) this.handleEnd(it);
    }
    requestAnimationFrame(this.tick);
  }

  // ---------- Audio / speed / seeking ----------
  applyAudio(v) {
    const s = this.hooks.getSettings();
    v.muted = !this.unlocked || s.muted || s.volume === 0;
    v.volume = s.volume;
  }
  applyAudioCurrent() { const v = this.currentVideo(); if (v) this.applyAudio(v); }
  applySpeedCurrent() { const v = this.currentVideo(); if (v) v.playbackRate = this.hooks.getSettings().speed; }
  setScrubbing(on) { this.scrubbing = on; }
  seekFraction(f) {
    const v = this.currentVideo();
    if (v && isFinite(v.duration)) v.currentTime = f * v.duration;
  }

  unlock() {
    this.unlocked = true;
    this.justUnlocked = true;      // the very first tap should only enable sound
    setTimeout(() => { this.justUnlocked = false; }, 450);
    this.applyAudioCurrent();
    if (this.hooks.onUnlock) this.hooks.onUnlock();
  }

  onVisibility() {
    const it = this.items[this.index];
    if (!it || !it.video) return;
    if (document.hidden) it.video.pause();
    else if (!it.userPaused) this.playCurrent();
  }

  // ---------- Taps ----------
  onClick(e) {
    const btn = e.target.closest('button[data-act]');
    if (btn) {
      const it = this.items[Number(btn.closest('.slide').dataset.i)];
      if (!it) return;
      if (btn.dataset.act === 'skip') this.next();
      else {                                   // retry
        this.unmount(it.i);
        this.updateWindow();
        if (it.i === this.index) this.playCurrent();
      }
      return;
    }
    if (this.justUnlocked) return;
    const now = Date.now();
    if (now - this.lastTap < 300) {            // double-tap = favorite
      clearTimeout(this.tapTimer);
      this.lastTap = 0;
      this.heartAt(e.clientX, e.clientY);
      const post = this.getCurrent();
      if (post) this.hooks.onDoubleTap(post);
    } else {                                    // single tap = pause/play (after waiting to see if a 2nd tap comes)
      this.lastTap = now;
      this.tapTimer = setTimeout(() => this.togglePause(), 300);
    }
  }

  togglePause() {
    const it = this.items[this.index];
    if (!it || !it.video) return;
    const v = it.video;
    const icon = it.slide.querySelector('.pause-icon');
    if (v.paused) { it.userPaused = false; v.play().catch(() => {}); icon.textContent = '▶'; }
    else { it.userPaused = true; v.pause(); icon.textContent = '⏸'; }
    icon.classList.remove('show');
    void icon.offsetWidth;          // restarts the little animation
    icon.classList.add('show');
  }

  heartAt(x, y) {
    const h = document.createElement('div');
    h.className = 'heart';
    h.textContent = '♥';
    h.style.left = x + 'px';
    h.style.top = y + 'px';
    document.body.appendChild(h);
    setTimeout(() => h.remove(), 900);
  }
}
