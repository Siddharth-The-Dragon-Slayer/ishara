'use strict';
/* ============================================================================
   Avatar Animation — Three.js ISL signing avatar for ZenAI.
   Ported from AfterMath's useAvatarAnimation.ts (React hook → plain JS class).
   ============================================================================ */

window.AvatarAnimator = (function() {
  // Require Three.js globally (loaded via <script> tag in index.html)
  var THREE = window.THREE;

  function AvatarAnimator(options) {
    options = options || {};
    this.canvasId = options.canvasId || 'islAvatarCanvas';
    this.onHighlight = options.onHighlight || null;
    this.onComplete = options.onComplete || null;

    this.flag = false;
    this.pending = false;
    this.animations = [];
    this.characters = [];
    this.scene = null;
    this.renderer = null;
    this.camera = null;
    this.avatar = null;
    this.speed = 0.1;
    this.pauseDuration = 800;
    this.botKey = 'ybot';
    this._animateLoop = this._animateLoop.bind(this);
  }

  AvatarAnimator.prototype.init = function(canvasId) {
    if (canvasId) this.canvasId = canvasId;
    var self = this;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x1a1f2e);

    // Key light
    var spot = new THREE.SpotLight(0xffffff, 1.5);
    spot.position.set(0, 5, 5);
    this.scene.add(spot);

    // Fill light
    var fill = new THREE.DirectionalLight(0xc8d6e5, 0.8);
    fill.position.set(-3, 3, 4);
    this.scene.add(fill);

    // Rim light
    var rim = new THREE.DirectionalLight(0x8ecae6, 0.4);
    rim.position.set(2, 2, -3);
    this.scene.add(rim);

    // Ambient
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.4));
    // Hemisphere
    this.scene.add(new THREE.HemisphereLight(0xffeedd, 0x223344, 0.3));

    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
    });
    this.renderer.outputEncoding = THREE.sRGBEncoding;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;

    var canvasEl = document.getElementById(this.canvasId);
    if (!canvasEl) { console.error('[AvatarAnimator] Canvas element not found:', this.canvasId); return; }

    var w = canvasEl.offsetWidth || 260;
    var h = canvasEl.offsetHeight || Math.round(w * 0.85);
    this.renderer.setSize(w, h);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio * 1.5, 3));
    canvasEl.innerHTML = '';
    canvasEl.appendChild(this.renderer.domElement);

    this.camera = new THREE.PerspectiveCamera(28, w / h, 0.5, 10);
    this.camera.position.z = 2.2;
    this.camera.position.y = 1.35;

    // Auto-resize renderer when container changes size
    var resizeSelf = this;
    if (typeof ResizeObserver !== 'undefined') {
      this._resizeObs = new ResizeObserver(function() {
        var nw = canvasEl.offsetWidth || 260;
        var nh = canvasEl.offsetHeight || Math.round(nw * 0.85);
        resizeSelf.renderer.setSize(nw, nh);
        resizeSelf.camera.aspect = nw / nh;
        resizeSelf.camera.updateProjectionMatrix();
        if (resizeSelf.scene && resizeSelf.camera) {
          resizeSelf.renderer.render(resizeSelf.scene, resizeSelf.camera);
        }
      });
      this._resizeObs.observe(canvasEl);
    }

    this._loadModel();
  };

  AvatarAnimator.prototype._loadModel = function() {
    var self = this;
    // Remove old avatar if any
    if (this.avatar && this.scene) {
      this.scene.remove(this.avatar);
      this.avatar = null;
    }

    var modelPath = './models/' + this.botKey + '/' + this.botKey + '.glb';
    var loader = new THREE.GLTFLoader();
    loader.load(modelPath, function(gltf) {
      gltf.scene.traverse(function(child) {
        if (child.isSkinnedMesh) {
          child.frustumCulled = false;
          var mats = Array.isArray(child.material) ? child.material : [child.material];
          for (var i = 0; i < mats.length; i++) {
            mats[i].side = THREE.DoubleSide;
            mats[i].depthWrite = true;
          }
        }
      });
      self.avatar = gltf.scene;
      self.scene.add(self.avatar);
      // Apply default pose
      if (window.ISL_ANIMATIONS && window.ISL_ANIMATIONS.defaultPose) {
        window.ISL_ANIMATIONS.defaultPose(self);
      }
      self.renderer.render(self.scene, self.camera);
    }, undefined, function(err) {
      console.error('[AvatarAnimator] Model load error:', err);
    });
  };

  AvatarAnimator.prototype._animateLoop = function() {
    var self = this;
    if (this.animations.length === 0) {
      this.pending = false;
      if (this.onComplete) this.onComplete();
      return;
    }
    requestAnimationFrame(this._animateLoop);

    var frame = this.animations[0];
    if (frame.length) {
      if (!this.flag) {
        var type = frame[0];
        if (type === 'add-text') {
          this.animations.shift();
        } else if (type === 'highlight-update') {
          var count = frame[1];
          if (this.onHighlight) this.onHighlight(count);
          this.animations.shift();
        } else {
          for (var i = 0; i < frame.length;) {
            var boneName = frame[i][0];
            var action = frame[i][1];
            var axis = frame[i][2];
            var limit = frame[i][3];
            var bone = this.avatar ? this.avatar.getObjectByName(boneName) : null;
            if (!bone) { frame.splice(i, 1); continue; }

            var current = bone[action][axis];
            if (Math.abs(current - limit) <= this.speed) {
              bone[action][axis] = limit;
              frame.splice(i, 1);
            } else if (current < limit) {
              bone[action][axis] += this.speed;
              i++;
            } else {
              bone[action][axis] -= this.speed;
              i++;
            }
          }
        }
      }
    } else {
      this.flag = true;
      var pd = this.pauseDuration;
      setTimeout(function() { self.flag = false; }, pd / 2);
      this.animations.shift();
    }
    this.renderer.render(this.scene, this.camera);
  };

  // Alias for the animate loop (used by animation files that call ref.animate())
  AvatarAnimator.prototype.animate = function() {
    this._animateLoop();
  };

  AvatarAnimator.prototype.sign = function(glossText) {
    var anims = window.ISL_ANIMATIONS;
    if (!anims) return;
    var words = glossText.toUpperCase().trim().split(/\s+/).filter(Boolean);
    for (var w = 0; w < words.length; w++) {
      var word = words[w];
      if (anims.words[word]) {
        this.animations.push(['add-text', word + ' ']);
        anims.words[word](this);
        anims.restPose(this);
      } else {
        var chars = word.split('');
        for (var c = 0; c < chars.length; c++) {
          var ch = chars[c];
          this.animations.push(['add-text', c === chars.length - 1 ? ch + ' ' : ch]);
          if (anims.alphabets[ch]) anims.alphabets[ch](this);
        }
        anims.restPose(this);
        this.animations.push([]); // Pause after fingerspelled word
      }
    }
  };

  AvatarAnimator.prototype.signWithCaptions = function(glossText, summary) {
    var anims = window.ISL_ANIMATIONS;
    if (!anims) return;
    var glossWords = glossText.toUpperCase().trim().split(/\s+/).filter(Boolean);
    var summaryWords = (summary || '').trim().split(/\s+/).filter(Boolean);
    var N = glossWords.length;
    var M = summaryWords.length;

    for (var i = 0; i < N; i++) {
      var word = glossWords[i];
      var highlightCount = Math.max(1, Math.round(((i + 1) / N) * M));
      this.animations.push(['highlight-update', highlightCount]);

      if (anims.words[word]) {
        this.animations.push(['add-text', word + ' ']);
        anims.words[word](this);
        anims.restPose(this);
      } else {
        var chars = word.split('');
        for (var c = 0; c < chars.length; c++) {
          var ch = chars[c];
          this.animations.push(['add-text', c === chars.length - 1 ? ch + ' ' : ch]);
          if (anims.alphabets[ch]) anims.alphabets[ch](this);
        }
        anims.restPose(this);
        this.animations.push([]);
      }
    }

    if (!this.pending) {
      this.pending = true;
      this.animate();
    }
  };

  AvatarAnimator.prototype.stop = function() {
    this.animations = [];
    this.flag = false;
    this.pending = false;
    if (this.onHighlight) this.onHighlight(0);
  };

  AvatarAnimator.prototype.setSpeed = function(v) {
    this.speed = v;
  };

  AvatarAnimator.prototype.setBot = function(key) {
    if (key === this.botKey) return;
    this.botKey = key;
    this.stop();
    this._loadModel();
  };

  AvatarAnimator.prototype.dispose = function() {
    this.stop();
    if (this.renderer) this.renderer.dispose();
  };

  return AvatarAnimator;
})();
