import { browser } from 'wxt/browser';
import type { FetchResponse } from '../types/messages';
import type { Settings, SettingsChanges } from '../constants';
import { BasePage } from './BasePage';
import { analyzeFullBuffer } from '../../vendor/realtime-bpm-analyzer.esm.js';

export class AlbumPage extends BasePage {
  progressBarContainer: HTMLDivElement | null;
  _trackedAudios: Set<HTMLAudioElement>;
  _bpmCache: Record<string, number>;
  constructor(settings: Partial<Settings> = {}) {
    super(settings);
    this.progressBarContainer = null;
    this._trackedAudios = new Set();
    this._bpmCache = {};
  }

  override init() {
    super.init();

    this.setupStickyPlayer();
    this.setupProgressBar();
    this.setupBpmAnalyzer();
  }

  static override isMatch() {
    return !!document.querySelector<HTMLElement>('.inline_player');
  }

  // Enable autoplay only for related tracks as Bandcamp has it's own auto-play on album pages
  override setupAutoPlayNext() {
    if (this.autoPlayInterval) {
      clearInterval(this.autoPlayInterval);
    }

    if (!this.settings.autoPlayNext) {
      return;
    }

    this.autoPlayInterval = window.setInterval(() => {
      const audio = this.getAudioElement();
      const isAudioEnding =
        audio &&
        audio.duration - audio.currentTime <= 1 &&
        audio.paused === false;

      const isPlayingLastTrackFromAlbum =
        document.querySelector<HTMLElement>('#track_table tr.current_track') ===
        document.querySelector<HTMLElement>('#track_table tr:last-child');
      const isPlayingRelatedTrack = this.getPlayingRelatedTrack();

      if (
        isAudioEnding &&
        (isPlayingLastTrackFromAlbum || isPlayingRelatedTrack)
      ) {
        this.nextSong();
      }
    }, 700);
  }

  override applySettingsChanges(changes: SettingsChanges) {
    super.applySettingsChanges(changes);

    if (changes.stickyPlayer !== undefined) {
      this.setupStickyPlayer();
    }
    if (changes.showProgressBar !== undefined) {
      this.setupProgressBar();
    }
    if (changes.showBpm !== undefined) {
      this.setupBpmAnalyzer();
    }
  }

  override togglePlayPause() {
    const audio = this.getAudioElement();
    if (audio && audio.readyState > 0) {
      audio.paused ? audio.play() : audio.pause();
    } else {
      document.querySelector<HTMLElement>('.playbutton, .playpause')?.click();
    }
  }

  override nextSong() {
    const nextButton = document.querySelector<HTMLElement>('.nextbutton');
    const isPlayingLastTrackFromAlbum =
      document.querySelector<HTMLElement>('#track_table tr.current_track') ===
      document.querySelector<HTMLElement>('#track_table tr:last-child');
    const playingRelatedTrack = this.getPlayingRelatedTrack();

    if (playingRelatedTrack) {
      playingRelatedTrack.parentElement?.nextElementSibling
        ?.querySelector<HTMLElement>('.play-button')
        ?.click();
    } else if (isPlayingLastTrackFromAlbum) {
      const firstRecommendedTrack = document.querySelector<HTMLElement>(
        '.recommended-album .play-button',
      );
      firstRecommendedTrack?.click();
      firstRecommendedTrack?.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
    } else if (nextButton) {
      nextButton.click();
    } else {
      super.nextSong();
    }
  }

  override prevSong() {
    const prevButton = document.querySelector<HTMLElement>('.prevbutton');
    const playingRelatedTrack = this.getPlayingRelatedTrack();
    const isPlayingFirstTrackFromRecommended =
      document.querySelector<HTMLElement>(
        '.recommendations-content .recommended-album .playing',
      )?.parentElement ===
      document.querySelector<HTMLElement>(
        '.recommendations-content .recommended-album:first-child',
      );

    if (isPlayingFirstTrackFromRecommended) {
      const lastTrackFromAlbum =
        document.querySelector<HTMLElement>(
          '#track_table tr:last-child .play_status',
        ) ?? document.querySelector<HTMLElement>('.playbutton');
      lastTrackFromAlbum?.click();
      lastTrackFromAlbum?.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
    } else if (playingRelatedTrack) {
      playingRelatedTrack?.parentElement?.previousElementSibling
        ?.querySelector<HTMLElement>('.play-button')
        ?.click();
    } else if (prevButton) {
      prevButton.click();
    } else {
      super.prevSong();
    }
  }

  override addToWishlist() {
    const playingRelatedTrack = this.getPlayingRelatedTrack();
    if (playingRelatedTrack) {
      const relatedTrackUrl =
        playingRelatedTrack.parentElement?.querySelector<HTMLAnchorElement>(
          'a.album-link',
        )?.href;
      if (relatedTrackUrl) window.open(relatedTrackUrl, '_blank');
    } else {
      document
        .querySelector<HTMLElement>(
          '.wishlist #wishlist-msg, .wishlisted #wishlisted-msg',
        )
        ?.click();
    }
  }

  override openCurrentTrack() {
    const playingRelatedTrack = this.getPlayingRelatedTrack();
    if (playingRelatedTrack) {
      const url =
        playingRelatedTrack.parentElement?.querySelector<HTMLAnchorElement>(
          'a.album-link',
        )?.href;
      if (url) window.open(url, '_blank');
    }
  }

  setupStickyPlayer() {
    const player = document.querySelector<HTMLElement>('.inline_player');
    if (!player) {
      return;
    }

    if (!this.settings.stickyPlayer) {
      player.classList.remove('sticky');
      return;
    }

    player.classList.add('sticky');

    const styleElement = document.getElementById('custom-design-rules-style');
    if (styleElement) {
      try {
        const designData = JSON.parse(
          styleElement.getAttribute('data-design') ?? '{}',
        );
        if (designData.body_color) {
          player.style.backgroundColor = `#${designData.body_color}`;
        }
      } catch (e) {
        console.error('[amp-for-bandcamp] Error parsing design data:', e);
      }
    }
  }

  getPlayingRelatedTrack() {
    return document.querySelector<HTMLElement>('.recommended-album .playing');
  }

  getTrackUrls() {
    const tralbumEl = document.querySelector<HTMLElement>('[data-tralbum]');
    if (!tralbumEl) return {};

    try {
      const tralbum = JSON.parse(tralbumEl.dataset.tralbum ?? '{}');
      const urls: Record<number, string> = {};
      for (const track of tralbum.trackinfo || []) {
        if (!track.file) continue;
        const url = Object.values(track.file).find(
          (u) => typeof u === 'string' && /https:\/\/\w+\.bcbits\.com/.test(u),
        );
        if (typeof url === 'string') urls[track.track_num ?? 1] = url;
      }
      return urls;
    } catch {
      return {};
    }
  }

  getCurrentTrackNum(trackUrls: Record<number, string>) {
    const currentRow = document.querySelector<HTMLElement>(
      '#track_table tr.current_track .track-number-col',
    );
    if (currentRow) return parseInt(currentRow.textContent);

    // Single track page — return the first available track number
    const nums = Object.keys(trackUrls).map(Number);
    return nums[0] ?? 1;
  }

  setupBpmAnalyzer() {
    if (!this.settings.showBpm) {
      const bpmEl = document.querySelector<HTMLElement>('.bpm-display');
      if (bpmEl) bpmEl.textContent = '';
      return;
    }

    const trackUrls = this.getTrackUrls();
    let lastTrackNum: number | null = null;

    const ensureElement = () => {
      let el = document.querySelector<HTMLElement>('.bpm-display');
      if (!el) {
        el = document.createElement('span');
        el.className = 'bpm-display';
        const time =
          document.querySelector<HTMLElement>('.inline_player .time') ||
          document.querySelector<HTMLElement>('#trackInfoInner .time');
        if (time) time.appendChild(el);
      }
      return el;
    };

    const analyze = async (url: string) => {
      if (this._bpmCache[url]) return this._bpmCache[url];

      const response: FetchResponse = await browser.runtime.sendMessage({
        type: 'fetch',
        url,
      });
      if ('error' in response) throw new Error(response.error);
      const arrayBuffer = new Uint8Array(response.data).buffer;

      const audioContext = new AudioContext();
      const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
      const candidates = await analyzeFullBuffer(audioBuffer);
      await audioContext.close();

      const bpm = candidates?.[0] ? Math.round(candidates[0].tempo) : null;
      if (bpm) this._bpmCache[url] = bpm;
      return bpm;
    };

    const update = async () => {
      if (!this.settings.showBpm) return;
      const trackNum = this.getCurrentTrackNum(trackUrls);
      if (trackNum === lastTrackNum) return;
      lastTrackNum = trackNum;

      const url = trackUrls[trackNum];
      if (!url) return;

      const bpmEl = ensureElement();
      bpmEl.textContent = '';

      try {
        const bpm = await analyze(url);
        if (bpm && this.getCurrentTrackNum(trackUrls) === trackNum) {
          bpmEl.textContent = ` | ${bpm} BPM`;
        }
      } catch (error) {
        console.error('[amp-for-bandcamp] BPM analysis error:', error);
      }
    };

    update();

    const trackTable = document.querySelector<HTMLElement>('#track_table');
    if (trackTable) {
      new MutationObserver(update).observe(trackTable, {
        attributes: true,
        subtree: true,
      });
    }
  }

  setupProgressBar() {
    if (!this.settings.showProgressBar) {
      if (this.progressBarContainer) {
        this.progressBarContainer.style.display = 'none';
      }
      return;
    }

    const update = () => {
      const audio = this.getAudioElement();
      if (!audio || audio.paused || !audio.duration) return;

      const playingRelated = this.getPlayingRelatedTrack();
      const container = playingRelated
        ? playingRelated.closest('.recommended-album')
        : document.querySelector<HTMLElement>('#tralbumArt');

      if (!container) return;

      if (
        !this.progressBarContainer ||
        !container.contains(this.progressBarContainer)
      ) {
        if (this.progressBarContainer) this.progressBarContainer.remove();

        this.progressBarContainer = document.createElement('div');
        this.progressBarContainer.className =
          'playback-progress album-art-progress';
        this.progressBarContainer.innerHTML =
          '<div class="playback-progress-inner"></div>';

        let artChild: HTMLElement | null = container.querySelector('img');
        while (artChild && artChild.parentElement !== container) {
          artChild = artChild.parentElement;
        }
        if (artChild) {
          artChild.after(this.progressBarContainer);
        } else {
          container.appendChild(this.progressBarContainer);
        }
      }

      const innerBar = this.progressBarContainer.querySelector<HTMLElement>(
        '.playback-progress-inner',
      );
      if (innerBar)
        innerBar.style.width = `${(audio.currentTime / audio.duration) * 100}%`;
      this.progressBarContainer.style.display = 'block';
    };

    const hide = () => {
      if (this.progressBarContainer)
        this.progressBarContainer.style.display = 'none';
    };

    const attach = (audio: HTMLAudioElement) => {
      if (this._trackedAudios.has(audio)) return;
      this._trackedAudios.add(audio);
      audio.addEventListener('timeupdate', update);
      audio.addEventListener('play', update);
      audio.addEventListener('pause', update);
      audio.addEventListener('ended', hide);
    };

    document.querySelectorAll('audio').forEach(attach);
    new MutationObserver(() =>
      document.querySelectorAll('audio').forEach(attach),
    ).observe(document.body, { childList: true, subtree: true });
  }
}
