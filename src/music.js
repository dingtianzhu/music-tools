// ==UserScript==
// @name         网易云音乐下载器 (Audio/Lyrics/MV Downloader)
// @namespace    http://tampermonkey.net/
// @version      1.4
// @description  自动捕获网易云音乐当前播放的歌曲, 支持一键下载高品质音频、完整歌词及 MV (如果有的话)。包含“一键秒播放捕获并自动暂停下载”功能。
// @author       Antigravity
// @match        *://music.163.com/*
// @match        *://*.music.163.com/*
// @grant        GM_download
// @grant        GM_xmlhttpRequest
// @connect      music.163.com
// @connect      126.net
// @connect      *
// @run-at       document-start
// ==/UserScript==
(function() {
    'use strict';
    // 仅在顶层窗口运行，避免在 iframe 内部重复生成悬浮窗
    const isTopWindow = window === window.top;
    
    // 全局状态管理
    const state = {
        audioUrl: null,
        songId: null,
        title: '未知歌曲',
        artist: '未知歌手',
        album: '',
        cover: 'https://music.163.com/style/web2/img/default/default_album.jpg',
        mvid: 0,
        isPlaying: false,
        downloadProgress: 0,
        audioCache: new Map(), // 用于缓存已播放歌曲的链接 { songId => audioUrl }
        isAutoDownload: localStorage.getItem('music_dl_auto_download') === 'true',
        lastDownloadedSongId: null, // 记录上一次自动下载的歌曲 ID，防止重复触发
        isAutoCapturing: false // 是否正处于“秒播捕获”状态
    };
    if (isTopWindow) {
        initTopWindow();
    }
    // ==========================================
    // 1. 顶层窗口逻辑 (控制面板与媒体拦截)
    // ==========================================
    function initTopWindow() {
        console.log('[MusicDownloader] 初始化音乐下载器...');
        
        // 劫持 HTMLAudioElement.prototype.src 以捕获音频流链接
        hookAudioSrc();
        
        // 确保安全地注入 UI (如果 body 还没加载出来，则等待或轮询)
        safeInjectUI();
        // 定期检测状态（由于网易云网页版是单页应用 SPA，大部分操作在 iframe 内进行）
        setInterval(monitorPlayer, 1000);
        setInterval(detectAudioElement, 1000);
    }
    // 劫持音频 src setter
    function hookAudioSrc() {
        try {
            const originalSetAttribute = Element.prototype.setAttribute;
            Element.prototype.setAttribute = function(name, value) {
                if (name === 'src' && this.tagName === 'AUDIO') {
                    onAudioCaptured(value);
                }
                return originalSetAttribute.apply(this, arguments);
            };
            const descriptor = Object.getOwnPropertyDescriptor(HTMLAudioElement.prototype, 'src');
            if (descriptor && descriptor.set) {
                const originalSet = descriptor.set;
                Object.defineProperty(HTMLAudioElement.prototype, 'src', {
                    set: function(val) {
                        onAudioCaptured(val);
                        return originalSet.call(this, val);
                    },
                    get: descriptor.get,
                    configurable: true
                });
            } else {
                Object.defineProperty(HTMLAudioElement.prototype, 'src', {
                    set: function(val) {
                        onAudioCaptured(val);
                        this.setAttribute('src', val);
                    },
                    get: function() {
                        return this.getAttribute('src');
                    },
                    configurable: true
                });
            }
            console.log('[MusicDownloader] 成功挂载音频流捕获引擎');
        } catch (e) {
            console.error('[MusicDownloader] 挂载音频流捕获引擎失败:', e);
        }
    }
    // 捕获到音频链接时的回调
    function onAudioCaptured(url) {
        if (!url || url.startsWith('blob:')) return;
        
        // 🚨 如果是自动秒播捕获模式，立即暂停音频播放，防止发出声音！
        if (state.isAutoCapturing) {
            const audioEl = document.querySelector('audio');
            if (audioEl) {
                audioEl.pause();
                console.log('[MusicDownloader] 秒播捕获：已立即暂停音频播放');
            }
        }
        
        // 稍作延迟，等待 DOM 更新，以便获取匹配的歌曲 ID
        setTimeout(async () => {
            const info = getPlayingSongInfoFromDOM();
            if (info && info.id) {
                state.audioCache.set(info.id, url);
                
                // 如果当前正在处理这首歌，并且音频源刚刚捕获
                if (state.songId === info.id) {
                    state.audioUrl = url;
                    updateDownloadButtonState();
                    
                    // 检查自动秒播捕获触发条件
                    if (state.isAutoCapturing) {
                        state.isAutoCapturing = false;
                        showStatus('捕获成功！已自动暂停播放并启动下载。');
                        startAudioDownload();
                        await startLyricDownload();
                    } 
                    // 检查常规自动播放下载触发条件
                    else if (state.isAutoDownload && state.lastDownloadedSongId !== info.id) {
                        state.lastDownloadedSongId = info.id;
                        console.log(`[MusicDownloader] 触发自动下载: ${info.title} - ${info.artist}`);
                        showStatus('已触发自动下载...');
                        startAudioDownload();
                        await startLyricDownload();
                    }
                }
                console.log(`[MusicDownloader] 已捕获歌曲 [${info.title}] 的播放流直链接:`, url);
            }
        }, 500);
    }
    // 获取当前正在播放的歌曲信息（从底部播放栏获取）
    function getPlayingSongInfoFromDOM() {
        const playerBar = document.querySelector('.m-playbar');
        if (!playerBar) return null;
        const nameLink = playerBar.querySelector('.words .name');
        const artistSpan = playerBar.querySelector('.words .by a');
        const coverImg = playerBar.querySelector('.head img');
        if (!nameLink) return null;
        const href = nameLink.getAttribute('href');
        const match = href ? href.match(/id=(\d+)/) : null;
        const songId = match ? match[1] : null;
        return {
            id: songId,
            title: nameLink.textContent.trim(),
            artist: artistSpan ? artistSpan.textContent.trim() : '未知歌手',
            cover: coverImg ? coverImg.src.replace(/\?param=\d+y\d+$/, '') : '' // 移除缩略图参数以获取原图
        };
    }
    // 检测当前页面（支持在页面没有播放时，如果进入了某歌曲详情页，自动载入该歌曲信息）
    async function monitorPlayer() {
        // 优先检查 URL 是否处于特定歌曲详情页
        const hash = window.location.hash || window.location.href;
        const match = hash.match(/song\?id=(\d+)/);
        const songIdFromUrl = match ? match[1] : null;
        if (songIdFromUrl && state.songId !== songIdFromUrl) {
            // 用户浏览了新的歌曲详情页
            state.songId = songIdFromUrl;
            state.audioUrl = state.audioCache.get(songIdFromUrl) || null;
            showStatus('正在获取歌曲详情...');
            await fetchSongDetail(songIdFromUrl);
            
            // 如果开启了自动下载且未捕获过音频，则在切换到详情页时自动触发秒播捕获
            if (state.isAutoDownload && !state.audioUrl && state.lastDownloadedSongId !== songIdFromUrl) {
                state.lastDownloadedSongId = songIdFromUrl;
                triggerPlayAndCapture();
            }
            return;
        }
        // 如果不在单曲详情页，则追踪底部播放栏 of 歌曲
        if (!songIdFromUrl) {
            const playingInfo = getPlayingSongInfoFromDOM();
            if (playingInfo && playingInfo.id && state.songId !== playingInfo.id) {
                state.songId = playingInfo.id;
                state.title = playingInfo.title;
                state.artist = playingInfo.artist;
                state.cover = playingInfo.cover || state.cover;
                state.audioUrl = state.audioCache.get(playingInfo.id) || null;
                
                // 异步拉取详细数据 (如 mvid)
                await fetchSongDetail(playingInfo.id);
            }
        }
    }
    // 绑定 Audio 标签的播放事件以旋转黑胶唱片
    let cachedAudioEl = null;
    function detectAudioElement() {
        const audioEl = document.querySelector('audio');
        if (audioEl && audioEl !== cachedAudioEl) {
            cachedAudioEl = audioEl;
            
            const handlePlay = () => {
                state.isPlaying = true;
                const coverEl = document.querySelector('.music-dl-cover');
                if (coverEl) coverEl.classList.add('playing');
            };
            const handlePause = () => {
                state.isPlaying = false;
                const coverEl = document.querySelector('.music-dl-cover');
                if (coverEl) coverEl.classList.remove('playing');
            };
            audioEl.addEventListener('play', handlePlay);
            audioEl.addEventListener('playing', handlePlay);
            audioEl.addEventListener('pause', handlePause);
            audioEl.addEventListener('ended', handlePause);
            
            // 设定初始状态
            if (!audioEl.paused) {
                handlePlay();
            }
        }
    }
    // 获取歌曲详细元数据 (特别是 MV ID 和封面图)
    async function fetchSongDetail(songId) {
        const url = `https://music.163.com/api/song/detail/?id=${songId}&ids=[${songId}]`;
        try {
            const res = await fetch(url);
            const data = await res.json();
            if (data.songs && data.songs.length > 0) {
                const song = data.songs[0];
                state.title = song.name;
                state.artist = song.artists.map(a => a.name).join(', ');
                state.cover = song.album?.picUrl || state.cover;
                state.mvid = song.mvid || 0;
                state.audioUrl = state.audioCache.get(songId) || null;
                updateUI();
                showStatus('歌曲信息已更新');
            }
        } catch (e) {
            console.error('[MusicDownloader] 获取歌曲详情失败:', e);
        }
    }
    // ==========================================
    // 2. 界面渲染模块
    // ==========================================
    function safeInjectUI() {
        // 如果 document 还没有准备好，注册 DOM 监听
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => {
                pollForInject();
            });
        } else {
            pollForInject();
        }
    }
    function pollForInject() {
        const containerId = 'music-dl-container';
        if (document.getElementById(containerId)) return;
        // 针对没有 standard body 或者是 frameset 的页面进行兜底，获取可注入的节点
        const targetElement = document.body || document.documentElement;
        if (!targetElement) {
            // 再次延时轮询，直到能够拿到 DOM 树根节点
            setTimeout(pollForInject, 50);
            return;
        }
        injectUI(targetElement);
    }
    function injectUI(target) {
        if (document.getElementById('music-dl-container')) return;
        const container = document.createElement('div');
        container.id = 'music-dl-container';
        
        // 样式表
        const style = document.createElement('style');
        style.innerHTML = `
            #music-dl-bubble {
                position: fixed;
                bottom: 85px;
                right: 25px;
                width: 56px;
                height: 56px;
                border-radius: 50%;
                background: linear-gradient(135deg, #ff5e62, #ff9966);
                box-shadow: 0 4px 15px rgba(255, 94, 98, 0.4);
                display: flex;
                align-items: center;
                justify-content: center;
                cursor: pointer;
                z-index: 999999;
                transition: all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
                user-select: none;
            }
            #music-dl-bubble:hover {
                transform: scale(1.1) rotate(15deg);
                box-shadow: 0 6px 20px rgba(255, 94, 98, 0.6);
            }
            #music-dl-bubble svg {
                width: 26px;
                height: 26px;
                fill: white;
            }
            #music-dl-panel {
                position: fixed;
                bottom: 155px;
                right: 25px;
                width: 320px;
                background: rgba(30, 30, 30, 0.78);
                backdrop-filter: blur(16px);
                -webkit-backdrop-filter: blur(16px);
                border: 1px solid rgba(255, 255, 255, 0.15);
                border-radius: 16px;
                box-shadow: 0 10px 30px rgba(0, 0, 0, 0.4);
                z-index: 999999;
                overflow: hidden;
                transition: all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.15);
                font-family: -apple-system, BlinkMacSystemFont, "Microsoft YaHei", sans-serif;
                color: #fff;
                opacity: 0;
                transform: translateY(20px) scale(0.95);
                display: none;
            }
            #music-dl-panel.show {
                display: block;
                opacity: 1;
                transform: translateY(0) scale(1);
            }
            .music-dl-header {
                padding: 12px 16px;
                display: flex;
                align-items: center;
                justify-content: space-between;
                border-bottom: 1px solid rgba(255, 255, 255, 0.08);
            }
            .music-dl-header h3 {
                margin: 0;
                font-size: 14px;
                font-weight: bold;
                background: linear-gradient(135deg, #ff9966, #ff5e62);
                -webkit-background-clip: text;
                -webkit-text-fill-color: transparent;
            }
            .music-dl-close {
                cursor: pointer;
                font-size: 18px;
                color: #aaa;
                transition: color 0.2s;
            }
            .music-dl-close:hover {
                color: #fff;
            }
            .music-dl-body {
                padding: 18px 16px;
                display: flex;
                flex-direction: column;
                align-items: center;
            }
            .music-dl-cover-container {
                position: relative;
                width: 100px;
                height: 100px;
                border-radius: 50%;
                margin-bottom: 14px;
                box-shadow: 0 4px 15px rgba(0,0,0,0.5);
                background: #111;
                display: flex;
                align-items: center;
                justify-content: center;
            }
            .music-dl-cover-container::after {
                content: '';
                position: absolute;
                width: 18px;
                height: 18px;
                background: #1e1e1e;
                border: 3px solid #111;
                border-radius: 50%;
            }
            .music-dl-cover {
                width: 86px;
                height: 86px;
                border-radius: 50%;
                object-fit: cover;
                animation: music-dl-spin 12s linear infinite;
                animation-play-state: paused;
            }
            .music-dl-cover.playing {
                animation-play-state: running;
            }
            @keyframes music-dl-spin {
                from { transform: rotate(0deg); }
                to { transform: rotate(360deg); }
            }
            .music-dl-info {
                text-align: center;
                width: 100%;
                margin-bottom: 12px;
            }
            .music-dl-title {
                font-size: 16px;
                font-weight: bold;
                margin-bottom: 4px;
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
                color: #fff;
            }
            .music-dl-artist {
                font-size: 12px;
                color: #bbb;
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
            }
            .music-dl-auto-wrap {
                width: 100%;
                display: flex;
                align-items: center;
                gap: 10px;
                margin-bottom: 14px;
                padding: 6px 10px;
                background: rgba(255, 255, 255, 0.05);
                border-radius: 8px;
                user-select: none;
            }
            .music-dl-auto-text {
                font-size: 12px;
                color: #ccc;
            }
            .music-dl-switch {
                position: relative;
                display: inline-block;
                width: 36px;
                height: 20px;
            }
            .music-dl-switch input {
                opacity: 0;
                width: 0;
                height: 0;
            }
            .music-dl-slider {
                position: absolute;
                cursor: pointer;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background-color: rgba(255, 255, 255, 0.2);
                transition: .3s;
                border-radius: 20px;
            }
            .music-dl-slider:before {
                position: absolute;
                content: "";
                height: 14px;
                width: 14px;
                left: 3px;
                bottom: 3px;
                background-color: white;
                transition: .3s;
                border-radius: 50%;
            }
            input:checked + .music-dl-slider {
                background: linear-gradient(135deg, #ff5e62, #ff9966);
            }
            input:checked + .music-dl-slider:before {
                transform: translateX(16px);
            }
            .music-dl-btn-group {
                width: 100%;
                display: flex;
                flex-direction: column;
                gap: 10px;
            }
            .music-dl-btn {
                width: 100%;
                padding: 10px;
                border: none;
                border-radius: 8px;
                background: rgba(255, 255, 255, 0.08);
                color: #fff;
                font-size: 13px;
                font-weight: 500;
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 8px;
                transition: all 0.2s;
            }
            .music-dl-btn:hover {
                background: rgba(255, 255, 255, 0.15);
            }
            .music-dl-btn-primary {
                background: linear-gradient(135deg, #ff5e62, #ff9966);
                box-shadow: 0 4px 10px rgba(255, 94, 98, 0.25);
            }
            .music-dl-btn-primary:hover {
                background: linear-gradient(135deg, #ff7b7f, #ffb085);
                box-shadow: 0 4px 12px rgba(255, 94, 98, 0.45);
            }
            .music-dl-btn-disabled {
                background: rgba(255, 255, 255, 0.03) !important;
                color: #666 !important;
                cursor: not-allowed;
                box-shadow: none !important;
            }
            .music-dl-btn-disabled svg {
                fill: #666 !important;
            }
            .music-dl-btn svg {
                width: 16px;
                height: 16px;
                fill: #fff;
            }
            .music-dl-mv-options {
                width: 100%;
                background: rgba(45, 45, 45, 0.95);
                border: 1px solid rgba(255, 255, 255, 0.12);
                border-radius: 8px;
                padding: 6px;
                margin-top: -6px;
                display: none;
                flex-direction: column;
                gap: 4px;
                box-shadow: 0 4px 15px rgba(0,0,0,0.3);
            }
            .music-dl-mv-option {
                padding: 8px 12px;
                font-size: 12px;
                border-radius: 6px;
                cursor: pointer;
                transition: background 0.2s;
                display: flex;
                justify-content: space-between;
                color: #ddd;
            }
            .music-dl-mv-option:hover {
                background: rgba(255, 255, 255, 0.1);
                color: #fff;
            }
            .music-dl-status {
                width: 100%;
                margin-top: 12px;
                font-size: 11px;
                color: #ff9966;
                text-align: center;
                min-height: 14px;
            }
            .music-dl-progress-bar {
                width: 100%;
                height: 4px;
                background: rgba(255, 255, 255, 0.1);
                border-radius: 2px;
                margin-top: 8px;
                overflow: hidden;
                display: none;
            }
            .music-dl-progress-fill {
                width: 0%;
                height: 100%;
                background: linear-gradient(90deg, #ff5e62, #ff9966);
                transition: width 0.1s;
            }
        `;
        // 浮动按钮 HTML
        const bubble = document.createElement('div');
        bubble.id = 'music-dl-bubble';
        bubble.title = '打开音乐下载器';
        bubble.innerHTML = `
            <svg viewBox="0 0 24 24" style="width: 24px; height: 24px;">
                <path d="M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96zM17 13l-5 5-5-5h3V9h4v4h3z"/>
            </svg>
        `;
        // 控制面板 HTML
        const panel = document.createElement('div');
        panel.id = 'music-dl-panel';
        panel.innerHTML = `
            <div class="music-dl-header">
                <h3>网易云音乐下载器</h3>
                <span class="music-dl-close">&times;</span>
            </div>
            <div class="music-dl-body">
                <div class="music-dl-cover-container">
                    <img class="music-dl-cover" src="${state.cover}" alt="封面">
                </div>
                <div class="music-dl-info">
                    <div class="music-dl-title">等待载入中...</div>
                    <div class="music-dl-artist">请播放或进入单曲详情页</div>
                </div>
                <div class="music-dl-auto-wrap">
                    <label class="music-dl-switch">
                        <input type="checkbox" id="music-dl-auto-toggle" ${state.isAutoDownload ? 'checked' : ''}>
                        <span class="music-dl-slider"></span>
                    </label>
                    <span class="music-dl-auto-text">自动秒播捕获下载 (无需手动播放)</span>
                </div>
                <div class="music-dl-btn-group">
                    <button id="music-dl-audio" class="music-dl-btn music-dl-btn-primary">
                        <svg viewBox="0 0 24 24"><path d="M12 16.5l4-4h-3v-9h-2v9H8l4 4zm9-13h-6v2h6v13H3V5.5h6v-2H3c-1.1 0-2 .9-2 2v13c0 1.1.9 2 2 2h18c1.1 0 2-.9 2-2v-13c0-1.1-.9-2-2-2z"/></svg>
                        <span>下载音频 (一键秒捕获并下载)</span>
                    </button>
                    <button id="music-dl-lyric" class="music-dl-btn">
                        <svg viewBox="0 0 24 24"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-2 14H7v-2h10v2zm0-4H7v-2h10v2zm0-4H7V7h10v2z"/></svg>
                        <span>下载歌词 (.lrc)</span>
                    </button>
                    <button id="music-dl-mv" class="music-dl-btn music-dl-btn-disabled">
                        <svg viewBox="0 0 24 24"><path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z"/></svg>
                        <span>下载 MV (无)</span>
                    </button>
                    <div id="music-dl-mv-options" class="music-dl-mv-options"></div>
                </div>
                <div id="music-dl-status" class="music-dl-status">未捕获到正在播放的音轨</div>
                <div id="music-dl-progress" class="music-dl-progress-bar">
                    <div id="music-dl-progress-fill" class="music-dl-progress-fill"></div>
                </div>
            </div>
        `;
        // 装载组件
        container.appendChild(style);
        container.appendChild(bubble);
        container.appendChild(panel);
        target.appendChild(container);
        // 绑定展开/折叠面板事件
        bubble.addEventListener('click', () => {
            panel.classList.toggle('show');
            updateUI();
        });
        panel.querySelector('.music-dl-close').addEventListener('click', () => {
            panel.classList.remove('show');
        });
        // 绑定按钮点击事件
        document.getElementById('music-dl-audio').addEventListener('click', startAudioDownload);
        document.getElementById('music-dl-lyric').addEventListener('click', startLyricDownload);
        document.getElementById('music-dl-mv').addEventListener('click', toggleMvOptions);
        // 绑定自动下载切换事件
        const autoToggle = document.getElementById('music-dl-auto-toggle');
        autoToggle.addEventListener('change', (e) => {
            state.isAutoDownload = e.target.checked;
            localStorage.setItem('music_dl_auto_download', e.target.checked);
            if (state.isAutoDownload) {
                showStatus('自动下载已开启，歌曲载入时将自动触发秒播下载');
            } else {
                showStatus('自动下载已关闭');
            }
        });
    }
    // ==========================================
    // 3. UI 更新逻辑
    // ==========================================
    function updateUI() {
        const panel = document.getElementById('music-dl-panel');
        if (!panel || !panel.classList.contains('show')) return;
        // 更新封面、标题、歌手
        panel.querySelector('.music-dl-cover').src = state.cover || 'https://music.163.com/style/web2/img/default/default_album.jpg';
        panel.querySelector('.music-dl-title').textContent = state.title;
        panel.querySelector('.music-dl-artist').textContent = state.artist;
        // 根据是否正在播放控制黑胶动画
        const coverEl = panel.querySelector('.music-dl-cover');
        if (state.isPlaying) {
            coverEl.classList.add('playing');
        } else {
            coverEl.classList.remove('playing');
        }
        // 更新音频下载按钮状态
        updateDownloadButtonState();
        // 更新 MV 按钮状态
        const mvBtn = document.getElementById('music-dl-mv');
        if (state.mvid && state.mvid > 0) {
            mvBtn.classList.remove('music-dl-btn-disabled');
            mvBtn.querySelector('span').textContent = '下载 MV (已匹配)';
        } else {
            mvBtn.classList.add('music-dl-btn-disabled');
            mvBtn.querySelector('span').textContent = '下载 MV (无)';
            document.getElementById('music-dl-mv-options').style.display = 'none';
        }
    }
    function updateDownloadButtonState() {
        const audioBtn = document.getElementById('music-dl-audio');
        if (!audioBtn) return;
        if (state.audioUrl) {
            audioBtn.querySelector('span').textContent = '下载音频 (已截获播放源)';
            audioBtn.classList.remove('music-dl-btn-disabled');
            showStatus('已成功捕获当前歌曲的播放流链接');
        } else {
            audioBtn.querySelector('span').textContent = '下载音频 (自动触发秒播捕获)';
            audioBtn.classList.remove('music-dl-btn-disabled');
            showStatus('准备就绪，一键自动唤醒捕获');
        }
    }
    function showStatus(text) {
        const statusEl = document.getElementById('music-dl-status');
        if (statusEl) statusEl.textContent = text;
    }
    // ==========================================
    // 3.5 自动秒播控制模块 (一键启动、极速捕获、瞬间暂停)
    // ==========================================
    function triggerPlayAndCapture() {
        if (!state.songId) return false;
        
        state.isAutoCapturing = true;
        showStatus('正在自动唤醒播放器获取音轨...');
        
        // 1. 尝试在 iframe (g_iframe) 的页面中寻找“播放”按钮并点击
        const iframe = document.getElementById('g_iframe');
        const iframeDoc = iframe ? (iframe.contentDocument || iframe.contentWindow.document) : null;
        
        let playBtn = null;
        if (iframeDoc) {
            const playSelectors = [
                'a.u-btni-play', // 歌曲单曲页主播放按钮
                'a[data-res-action="play"]', // 列表中当前歌曲的播放图标
                'a[title="播放"]',
                '.u-btn2-2',
                '.ply',
                '.play-btn'
            ];
            for (const selector of playSelectors) {
                playBtn = iframeDoc.querySelector(selector);
                if (playBtn) {
                    console.log(`[MusicDownloader] 在 iframe 中找到播放按钮并模拟点击 (选择器: ${selector})`);
                    break;
                }
            }
        }
        
        // 2. 如果没找到，尝试点击底部全局播放栏的播放/暂停按钮 (仅在底部显示的歌曲为当前目标歌时适用)
        if (!playBtn) {
            const bottomInfo = getPlayingSongInfoFromDOM();
            if (bottomInfo && bottomInfo.id === state.songId) {
                playBtn = document.querySelector('.m-playbar .btns .ply');
                if (playBtn) {
                    console.log('[MusicDownloader] 模拟点击底部播放栏播放按钮');
                }
            }
        }
        // 3. 执行触发
        if (playBtn) {
            try {
                playBtn.click();
                return true;
            } catch (e) {
                console.warn('[MusicDownloader] 自动触发播放受限 (浏览器 Autoplay 策略拦截):', e);
                showStatus('请点击页面任意空白处以启动自动下载...');
                
                // 绑定单次点击页面空白处自动触发
                const oneTimeClick = () => {
                    document.removeEventListener('click', oneTimeClick);
                    triggerPlayAndCapture();
                };
                document.addEventListener('click', oneTimeClick);
                return false;
            }
        }
        
        showStatus('未找到播放控件，请手动播放以捕获');
        state.isAutoCapturing = false;
        return false;
    }
    function showProgressBar(show) {
        const progressEl = document.getElementById('music-dl-progress');
        if (progressEl) progressEl.style.display = show ? 'block' : 'none';
    }
    function updateProgressBar(percentage) {
        const fillEl = document.getElementById('music-dl-progress-fill');
        if (fillEl) fillEl.style.width = `${percentage}%`;
    }
    // ==========================================
    // 4. 音频下载功能
    // ==========================================
    function startAudioDownload() {
        // 如果未捕获到音频直链，且当前未在秒播捕获状态，自动触发秒播
        if (!state.audioUrl && state.songId && !state.isAutoCapturing) {
            const triggered = triggerPlayAndCapture();
            if (triggered) {
                return; // 捕获成功后会自动在 onAudioCaptured 回调中再次执行本下载函数
            }
        }
        const filename = `${state.title} - ${state.artist}.mp3`;
        let dlUrl = state.audioUrl;
        
        if (!dlUrl) {
            // 如果连秒播捕获都因为各种原因没触发成功，则进行最后一层公开直链兜底
            dlUrl = `https://music.163.com/song/media/outer/url?id=${state.songId}.mp3`;
            console.log('[MusicDownloader] 尝试使用备用直链下载:', dlUrl);
            showStatus('正在连接备用直链...');
        } else {
            showStatus('正在下载捕获到的高质量播放流...');
        }
        showProgressBar(true);
        updateProgressBar(0);
        downloadFile(dlUrl, filename, 
            (loaded, total) => {
                const percent = Math.round((loaded / total) * 100);
                updateProgressBar(percent);
                showStatus(`正在下载音频: ${percent}%`);
            },
            () => {
                showProgressBar(false);
                showStatus('音频下载成功！');
            },
            (err) => {
                showProgressBar(false);
                if (!state.audioUrl) {
                    showStatus('备用链接下载失败，请手动播放以截获直链！');
                    if (!state.isAutoDownload) {
                        alert('下载失败！\n此歌曲为 VIP 或版权保护曲目，备用外链无法直接下载。\n\n请在网页播放器中“点击播放”该歌曲一次，脚本将自动拦截真实的播放通道并暂停播放，随后即可完美下载！');
                    }
                } else {
                    showStatus('下载出错，请重试');
                    console.error('[MusicDownloader] 下载音频失败:', err);
                }
            }
        );
    }
    // ==========================================
    // 5. 歌词下载功能
    // ==========================================
    async function startLyricDownload() {
        if (!state.songId) {
            return;
        }
        
        showStatus('正在获取歌词...');
        const url = `https://music.163.com/api/song/lyric?id=${state.songId}&lv=-1&kv=-1&tv=-1`;
        
        try {
            const res = await fetch(url);
            const data = await res.json();
            
            let finalLyric = '';
            
            if (data.lrc && data.lrc.lyric) {
                const originalLyric = data.lrc.lyric;
                const translatedLyric = data.tlyric?.lyric || '';
                
                // 将原歌词和翻译歌词按时间线合并
                finalLyric = mergeLyrics(originalLyric, translatedLyric);
            } else {
                finalLyric = '[00:00.00] 暂无歌词\n';
            }
            
            // 触发下载
            const filename = `${state.title} - ${state.artist}.lrc`;
            downloadTextFile(finalLyric, filename);
            showStatus('歌词下载成功！');
        } catch (e) {
            showStatus('歌词获取失败');
            console.error('[MusicDownloader] 获取歌词失败:', e);
        }
    }
    // 合并翻译歌词的辅助函数
    function mergeLyrics(lrcStr, tlrcStr) {
        if (!lrcStr) return '';
        if (!tlrcStr) return lrcStr;
        const parse = (str) => {
            const lines = str.split('\n');
            const map = new Map();
            const timeRegex = /^\[(\d{2}):(\d{2})(?:\.(\d{2,3}))?\]/;
            for (let line of lines) {
                line = line.trim();
                const match = line.match(timeRegex);
                if (match) {
                    const timestamp = match[0];
                    const content = line.substring(timestamp.length).trim();
                    map.set(timestamp, content);
                }
            }
            return map;
        };
        const lrcMap = parse(lrcStr);
        const tlrcMap = parse(tlrcStr);
        if (tlrcMap.size === 0) return lrcStr;
        const lines = lrcStr.split('\n');
        const mergedLines = [];
        const timeRegex = /^\[(\d{2}):(\d{2})(?:\.(\d{2,3}))?\]/;
        for (let line of lines) {
            line = line.trim();
            const match = line.match(timeRegex);
            if (match) {
                const timestamp = match[0];
                const originalContent = line.substring(timestamp.length).trim();
                const translatedContent = tlrcMap.get(timestamp);
                if (translatedContent) {
                    mergedLines.push(`${timestamp}${originalContent} // ${translatedContent}`);
                } else {
                    mergedLines.push(line);
                }
            } else {
                mergedLines.push(line);
            }
        }
        return mergedLines.join('\n');
    }
    // 下载文本文件 (LRC)
    function downloadTextFile(content, filename) {
        const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }
    // ==========================================
    // 6. MV 下载功能
    // ==========================================
    async function toggleMvOptions() {
        if (!state.mvid || state.mvid <= 0) return;
        const optionsPanel = document.getElementById('music-dl-mv-options');
        if (optionsPanel.style.display === 'flex') {
            optionsPanel.style.display = 'none';
            return;
        }
        showStatus('正在解析 MV 下载链接...');
        const url = `https://music.163.com/api/mv/detail?id=${state.mvid}&type=mp4`;
        try {
            const res = await fetch(url);
            const data = await res.json();
            if (data.data && data.data.brs) {
                const brs = data.data.brs; // e.g. {"240": "url", "480": "url", ...}
                optionsPanel.innerHTML = '';
                // 分辨率映射表
                const resNames = {
                    '1080': '1080P 超清',
                    '720': '720P 高清',
                    '480': '480P 标清',
                    '240': '240P 流畅'
                };
                // 按画质从高到低排列
                const sortedKeys = Object.keys(brs).sort((a, b) => parseInt(b) - parseInt(a));
                sortedKeys.forEach(resKey => {
                    const videoUrl = brs[resKey];
                    if (!videoUrl) return;
                    const option = document.createElement('div');
                    option.className = 'music-dl-mv-option';
                    option.innerHTML = `<span>${resNames[resKey] || resKey + 'P'}</span> <span>点击下载</span>`;
                    
                    option.addEventListener('click', () => {
                        optionsPanel.style.display = 'none';
                        startMvDownload(videoUrl, resKey);
                    });
                    optionsPanel.appendChild(option);
                });
                optionsPanel.style.display = 'flex';
                showStatus('请选择 MV 画质');
            } else {
                showStatus('未找到有效的 MV 下载地址');
            }
        } catch (e) {
            showStatus('解析 MV 失败');
            console.error('[MusicDownloader] 解析 MV 失败:', e);
        }
    }
    function startMvDownload(videoUrl, resolution) {
        const filename = `${state.title} - ${state.artist} [${resolution}P].mp4`;
        showStatus(`正在建立 MV 下载连接 [${resolution}P]...`);
        showProgressBar(true);
        updateProgressBar(0);
        downloadFile(videoUrl, filename,
            (loaded, total) => {
                const percent = Math.round((loaded / total) * 100);
                updateProgressBar(percent);
                showStatus(`正在下载 MV: ${percent}%`);
            },
            () => {
                showProgressBar(false);
                showStatus('MV 下载成功！');
            },
            (err) => {
                showProgressBar(false);
                showStatus('MV 下载失败');
                console.error('[MusicDownloader] 下载 MV 失败:', err);
            }
        );
    }
    // ==========================================
    // 7. 通用下载引擎 (Bypass CORS via Tampermonkey)
    // ==========================================
    function downloadFile(url, filename, onProgress, onLoad, onError) {
        // 优先使用 Tampermonkey 的 GM_download
        if (typeof GM_download === 'function') {
            GM_download({
                url: url,
                name: filename,
                onload: onLoad,
                onerror: (err) => {
                    console.warn('[MusicDownloader] GM_download 失败，正在启用 GM_xmlhttpRequest 备用下载通道...', err);
                    downloadViaGMXHR(url, filename, onProgress, onLoad, onError);
                },
                onprogress: (progress) => {
                    if (onProgress && progress.total > 0) {
                        onProgress(progress.position, progress.total);
                    }
                }
            });
        } else {
            downloadViaGMXHR(url, filename, onProgress, onLoad, onError);
        }
    }
    function downloadViaGMXHR(url, filename, onProgress, onLoad, onError) {
        GM_xmlhttpRequest({
            method: 'GET',
            url: url,
            responseType: 'blob',
            onprogress: (progress) => {
                if (onProgress && progress.lengthComputable && progress.total > 0) {
                    onProgress(progress.loaded, progress.total);
                }
            },
            onload: (response) => {
                if (response.status >= 200 && response.status < 300) {
                    const blob = response.response;
                    const blobUrl = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = blobUrl;
                    a.download = filename;
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    URL.revokeObjectURL(blobUrl);
                    if (onLoad) onLoad();
                } else {
                    if (onError) onError(new Error(`HTTP status ${response.status}`));
                }
            },
            onerror: (err) => {
                if (onError) onError(err);
            }
        });
    }
})();
