/**
 * Ethereal Fluid Smoke Effect
 * fBM Noise + Domain Warping + WebGL Fluid
 * Style: Flow Design Agency - Digital Smoke / Liquid Energy
 */

(function() {
    'use strict';

    if (window.matchMedia('(pointer: coarse)').matches) return;

    const canvas = document.getElementById('fluid-cursor');
    if (!canvas) return;

    const gl = canvas.getContext('webgl', {
        alpha: true,
        antialias: false,
        preserveDrawingBuffer: false
    });
    if (!gl) {
        console.log('WebGL not supported');
        return;
    }

    // Ethereal Configuration - TUNED FOR SMOKE EFFECT
    const config = {
        SIM_RESOLUTION: 128,
        DYE_RESOLUTION: 512,
        DENSITY_DISSIPATION: 0.985,  // High dissipation for ethereal fade
        VELOCITY_DISSIPATION: 0.98,
        PRESSURE: 0.8,
        PRESSURE_ITERATIONS: 20,
        CURL: 15,  // Medium curl for gentle swirls
        SPLAT_RADIUS: 0.3,
        SPLAT_FORCE: 4000,
        COLOR: { r: 0.65, g: 0.65, b: 0.63 },  // Soft gray-beige #A6A7A2
        NOISE_SCALE: 2.5,
        NOBE_WARP: 0.4,
        OPACITY: 0.12  // Low density for ethereal feel
    };

    // Resize
    function resize() {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
        gl.viewport(0, 0, canvas.width, canvas.height);
    }
    resize();
    window.addEventListener('resize', resize, { passive: true });

    // ==================== SHADERS WITH fBM NOISE ====================

    const baseVertexShader = `
        precision highp float;
        attribute vec2 aPosition;
        varying vec2 vUv;
        varying vec2 vL;
        varying vec2 vR;
        varying vec2 vT;
        varying vec2 vB;
        uniform vec2 texelSize;
        void main () {
            vUv = aPosition * 0.5 + 0.5;
            vL = vUv - vec2(texelSize.x, 0.0);
            vR = vUv + vec2(texelSize.x, 0.0);
            vT = vUv + vec2(0.0, texelSize.y);
            vB = vUv - vec2(0.0, texelSize.y);
            gl_Position = vec4(aPosition, 0.0, 1.0);
        }
    `;

    // fBM Noise Functions
    const noiseFunctions = `
        precision highp float;
        
        // Hash function
        vec3 hash3(vec2 p) {
            vec3 q = vec3(dot(p, vec2(127.1, 311.7)),
                          dot(p, vec2(269.5, 183.3)),
                          dot(p, vec2(419.2, 371.9)));
            return fract(sin(q) * 43758.5453);
        }
        
        // Gradient noise
        float noise(vec2 p) {
            vec2 i = floor(p);
            vec2 f = fract(p);
            f = f * f * (3.0 - 2.0 * f);
            
            float a = hash3(i).x;
            float b = hash3(i + vec2(1.0, 0.0)).x;
            float c = hash3(i + vec2(0.0, 1.0)).x;
            float d = hash3(i + vec2(1.0, 1.0)).x;
            
            return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
        }
        
        // fBM - Fractal Brownian Motion
        float fbm(vec2 p) {
            float value = 0.0;
            float amplitude = 0.5;
            float frequency = 1.0;
            
            for (int i = 0; i < 6; i++) {
                value += amplitude * noise(p * frequency);
                amplitude *= 0.5;
                frequency *= 2.0;
            }
            return value;
        }
        
        // Domain Warping for organic swirls
        vec2 domainWarp(vec2 p, float warpStrength) {
            vec2 q = vec2(fbm(p + vec2(0.0, 0.0)),
                          fbm(p + vec2(5.2, 1.3)));
            vec2 r = vec2(fbm(p + 4.0 * q + vec2(1.7, 9.2)),
                          fbm(p + 4.0 * q + vec2(8.3, 2.8)));
            return p + warpStrength * r;
        }
    `;

    const advectionShader = noiseFunctions + `
        varying vec2 vUv;
        uniform sampler2D uVelocity;
        uniform sampler2D uSource;
        uniform vec2 texelSize;
        uniform vec2 dyeTexelSize;
        uniform float dt;
        uniform float dissipation;
        uniform float time;
        uniform float noiseScale;
        uniform float noiseWarp;
        
        vec4 bilerp(sampler2D sam, vec2 uv, vec2 tsize) {
            vec2 st = uv / tsize - 0.5;
            vec2 iuv = floor(st);
            vec2 fuv = fract(st);
            fuv = fuv * fuv * (3.0 - 2.0 * fuv);
            vec4 a = texture2D(sam, (iuv + vec2(0.5, 0.5)) * tsize);
            vec4 b = texture2D(sam, (iuv + vec2(1.5, 0.5)) * tsize);
            vec4 c = texture2D(sam, (iuv + vec2(0.5, 1.5)) * tsize);
            vec4 d = texture2D(sam, (iuv + vec2(1.5, 1.5)) * tsize);
            return mix(mix(a, b, fuv.x), mix(c, d, fuv.x), fuv.y);
        }
        
        void main () {
            // Add subtle noise to UV for ethereal texture
            vec2 warpedUv = domainWarp(vUv * noiseScale, noiseWarp);
            float noiseVel = (fbm(warpedUv + time * 0.05) - 0.5) * 0.002;
            
            vec2 vel = bilerp(uVelocity, vUv, texelSize).xy;
            vel += vec2(noiseVel);
            
            vec2 coord = vUv - dt * vel * texelSize;
            vec4 result = dissipation * bilerp(uSource, coord, dyeTexelSize);
            
            // Add very subtle noise to density for smoke texture
            float smokeNoise = fbm(warpedUv * 2.0) * 0.03;
            result.xyz += smokeNoise;
            
            gl_FragColor = result;
        }
    `;

    const displayShader = noiseFunctions + `
        varying vec2 vUv;
        uniform sampler2D uTexture;
        uniform vec3 color;
        uniform float opacity;
        uniform float time;
        uniform float noiseScale;
        
        void main () {
            vec4 c = texture2D(uTexture, vUv);
            
            // fBM-based texture overlay for smoke feel
            vec2 warpedUv = domainWarp(vUv * noiseScale * 0.5, 0.3);
            float smokeTexture = fbm(warpedUv + time * 0.02) * 0.5 + 0.5;
            
            // Soft density calculation
            float density = (c.r + c.g + c.b) * 0.333;
            density *= smokeTexture;
            
            // Very soft gradient - ethereal glow
            vec3 fluidColor = color * density * 2.0;
            
            // Additive glow with falloff
            float glow = exp(-density * 3.0) * 0.15;
            fluidColor += color * glow;
            
            // Very low opacity for ethereal feel
            float alpha = min(density * opacity * 3.0, opacity);
            alpha *= smoothstep(0.0, 0.3, density); // Soft edge
            
            gl_FragColor = vec4(fluidColor, alpha);
        }
    `;

    const splatShader = `
        precision highp float;
        varying vec2 vUv;
        uniform sampler2D uTarget;
        uniform float aspectRatio;
        uniform vec3 color;
        uniform vec2 point;
        uniform float radius;
        uniform float opacity;
        
        void main () {
            vec2 p = vUv - point.xy;
            p.x *= aspectRatio;
            
            // Softer, more diffuse splat
            float d = dot(p, p);
            float strength = exp(-d / radius) * opacity;
            
            vec3 splat = strength * color;
            vec3 base = texture2D(uTarget, vUv).xyz;
            
            gl_FragColor = vec4(base + splat, 1.0);
        }
    `;

    const curlShader = `
        precision highp float;
        varying vec2 vUv;
        varying vec2 vL;
        varying vec2 vR;
        varying vec2 vT;
        varying vec2 vB;
        uniform sampler2D uVelocity;
        
        void main () {
            float L = texture2D(uVelocity, vL).y;
            float R = texture2D(uVelocity, vR).y;
            float T = texture2D(uVelocity, vT).x;
            float B = texture2D(uVelocity, vB).x;
            float vorticity = R - L - T + B;
            gl_FragColor = vec4(0.5 * vorticity, 0.0, 0.0, 1.0);
        }
    `;

    const vorticityShader = `
        precision highp float;
        varying vec2 vUv;
        varying vec2 vL;
        varying vec2 vR;
        varying vec2 vT;
        varying vec2 vB;
        uniform sampler2D uVelocity;
        uniform sampler2D uCurl;
        uniform float curl;
        uniform float dt;
        
        void main () {
            float L = texture2D(uCurl, vL).x;
            float R = texture2D(uCurl, vR).x;
            float T = texture2D(uCurl, vT).x;
            float B = texture2D(uCurl, vB).x;
            float C = texture2D(uCurl, vUv).x;
            
            vec2 force = 0.5 * vec2(abs(T) - abs(B), abs(R) - abs(L));
            force /= length(force) + 0.0001;
            force *= curl * C;
            force.y *= -1.0;
            
            vec2 vel = texture2D(uVelocity, vUv).xy;
            gl_FragColor = vec4(vel + force * dt, 0.0, 1.0);
        }
    `;

    const divergenceShader = `
        precision highp float;
        varying vec2 vUv;
        varying vec2 vL;
        varying vec2 vR;
        varying vec2 vT;
        varying vec2 vB;
        uniform sampler2D uVelocity;
        
        void main () {
            float L = texture2D(uVelocity, vL).x;
            float R = texture2D(uVelocity, vR).x;
            float T = texture2D(uVelocity, vT).y;
            float B = texture2D(uVelocity, vB).y;
            float div = 0.5 * (R - L + T - B);
            gl_FragColor = vec4(div, 0.0, 0.0, 1.0);
        }
    `;

    const pressureShader = `
        precision highp float;
        varying vec2 vUv;
        varying vec2 vL;
        varying vec2 vR;
        varying vec2 vT;
        varying vec2 vB;
        uniform sampler2D uPressure;
        uniform sampler2D uDivergence;
        
        void main () {
            float L = texture2D(uPressure, vL).x;
            float R = texture2D(uPressure, vR).x;
            float T = texture2D(uPressure, vT).x;
            float B = texture2D(uPressure, vB).x;
            float C = texture2D(uPressure, vUv).x;
            float divergence = texture2D(uDivergence, vUv).x;
            float pressure = (L + R + B + T - divergence) * 0.25;
            gl_FragColor = vec4(pressure, 0.0, 0.0, 1.0);
        }
    `;

    const gradientSubtractShader = `
        precision highp float;
        varying vec2 vUv;
        varying vec2 vL;
        varying vec2 vR;
        varying vec2 vT;
        varying vec2 vB;
        uniform sampler2D uPressure;
        uniform sampler2D uVelocity;
        
        void main () {
            float L = texture2D(uPressure, vL).x;
            float R = texture2D(uPressure, vR).x;
            float T = texture2D(uPressure, vT).x;
            float B = texture2D(uPressure, vB).x;
            vec2 velocity = texture2D(uVelocity, vUv).xy;
            velocity.xy -= vec2(R - L, T - B) * 0.5;
            gl_FragColor = vec4(velocity, 0.0, 1.0);
        }
    `;

    const clearShader = `
        precision highp float;
        varying vec2 vUv;
        uniform sampler2D uTexture;
        uniform float value;
        
        void main () {
            gl_FragColor = value * texture2D(uTexture, vUv);
        }
    `;

    // ==================== WEBGL UTILS ====================

    function createShader(type, source) {
        const shader = gl.createShader(type);
        gl.shaderSource(shader, source);
        gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
            console.error('Shader error:', gl.getShaderInfoLog(shader));
            return null;
        }
        return shader;
    }

    function createProgram(vertex, fragment) {
        const vs = createShader(gl.VERTEX_SHADER, vertex);
        const fs = createShader(gl.FRAGMENT_SHADER, fragment);
        if (!vs || !fs) return null;
        
        const program = gl.createProgram();
        gl.attachShader(program, vs);
        gl.attachShader(program, fs);
        gl.linkProgram(program);
        
        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
            console.error('Link error:', gl.getProgramInfoLog(program));
            return null;
        }
        return program;
    }

    function getUniforms(program) {
        const uniforms = {};
        const count = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS);
        for (let i = 0; i < count; i++) {
            const info = gl.getActiveUniform(program, i);
            uniforms[info.name] = gl.getUniformLocation(program, info.name);
        }
        return uniforms;
    }

    // ==================== FBO ====================

    const ext = gl.getExtension('OES_texture_half_float');
    const extLinear = gl.getExtension('OES_texture_half_float_linear');
    const halfFloatType = ext ? ext.HALF_FLOAT_OES : gl.UNSIGNED_BYTE;
    const filtering = extLinear ? gl.LINEAR : gl.NEAREST;

    class FBO {
        constructor(w, h, type, filter) {
            this.width = w;
            this.height = h;
            
            this.texture = gl.createTexture();
            gl.bindTexture(gl.TEXTURE_2D, this.texture);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, type, null);
            
            this.fbo = gl.createFramebuffer();
            gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
            gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.texture, 0);
            gl.viewport(0, 0, w, h);
            gl.clear(gl.COLOR_BUFFER_BIT);
        }
    }

    class DoubleFBO {
        constructor(w, h, type, filter) {
            this.read = new FBO(w, h, type, filter);
            this.write = new FBO(w, h, type, filter);
        }
        swap() {
            const temp = this.read;
            this.read = this.write;
            this.write = temp;
        }
    }

    // Create FBOs
    const velocity = new DoubleFBO(config.SIM_RESOLUTION, config.SIM_RESOLUTION, halfFloatType, filtering);
    const density = new DoubleFBO(config.DYE_RESOLUTION, config.DYE_RESOLUTION, halfFloatType, filtering);
    const pressure = new DoubleFBO(config.SIM_RESOLUTION, config.SIM_RESOLUTION, halfFloatType, gl.NEAREST);
    const divergence = new FBO(config.SIM_RESOLUTION, config.SIM_RESOLUTION, halfFloatType, gl.NEAREST);
    const curl = new FBO(config.SIM_RESOLUTION, config.SIM_RESOLUTION, halfFloatType, gl.NEAREST);

    // Create programs
    const advectionProgram = createProgram(baseVertexShader, advectionShader);
    const displayProgram = createProgram(baseVertexShader, displayShader);
    const splatProgram = createProgram(baseVertexShader, splatShader);
    const curlProgram = createProgram(baseVertexShader, curlShader);
    const vorticityProgram = createProgram(baseVertexShader, vorticityShader);
    const divergenceProgram = createProgram(baseVertexShader, divergenceShader);
    const pressureProgram = createProgram(baseVertexShader, pressureShader);
    const gradientSubtractProgram = createProgram(baseVertexShader, gradientSubtractShader);
    const clearProgram = createProgram(baseVertexShader, clearShader);

    if (!advectionProgram || !displayProgram) {
        console.error('Failed to create programs');
        return;
    }

    // Get uniforms
    const advectionUni = getUniforms(advectionProgram);
    const displayUni = getUniforms(displayProgram);
    const splatUni = getUniforms(splatProgram);
    const curlUni = getUniforms(curlProgram);
    const vorticityUni = getUniforms(vorticityProgram);
    const divergenceUni = getUniforms(divergenceProgram);
    const pressureUni = getUniforms(pressureProgram);
    const gradientSubtractUni = getUniforms(gradientSubtractProgram);
    const clearUni = getUniforms(clearProgram);

    // ==================== RENDER ====================

    const quadBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, -1, 1, 1, 1, 1, -1]), gl.STATIC_DRAW);

    const indexBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array([0, 1, 2, 0, 2, 3]), gl.STATIC_DRAW);

    function bind(program) {
        gl.useProgram(program);
        gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
        const pos = gl.getAttribLocation(program, 'aPosition');
        gl.enableVertexAttribArray(pos);
        gl.vertexAttribPointer(pos, 2, gl.FLOAT, false, 0, 0);
    }

    function blit(target) {
        if (target) {
            gl.bindFramebuffer(gl.FRAMEBUFFER, target.fbo);
            gl.viewport(0, 0, target.width, target.height);
        } else {
            gl.bindFramebuffer(gl.FRAMEBUFFER, null);
            gl.viewport(0, 0, canvas.width, canvas.height);
        }
        gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);
    }

    // ==================== SIMULATION ====================

    function splat(x, y, dx, dy) {
        bind(splatProgram);
        gl.uniform1i(splatUni.uTarget, density.read.texture);
        gl.uniform1f(splatUni.aspectRatio, canvas.width / canvas.height);
        gl.uniform3f(splatUni.color, config.COLOR.r, config.COLOR.g, config.COLOR.b);
        gl.uniform2f(splatUni.point, x, y);
        gl.uniform1f(splatUni.radius, config.SPLAT_RADIUS / 10.0);
        gl.uniform1f(splatUni.opacity, 0.08); // Low opacity for ethereal
        blit(density.write);
        density.swap();

        bind(splatProgram);
        gl.uniform1i(splatUni.uTarget, velocity.read.texture);
        gl.uniform3f(splatUni.color, dx, dy, 0.0);
        gl.uniform1f(splatUni.opacity, 1.0);
        blit(velocity.write);
        velocity.swap();
    }

    let time = 0;

    function step(dt) {
        time += dt;
        gl.disable(gl.BLEND);

        // Curl
        bind(curlProgram);
        gl.uniform2f(curlUni.texelSize, 1.0 / config.SIM_RESOLUTION, 1.0 / config.SIM_RESOLUTION);
        gl.uniform1i(curlUni.uVelocity, velocity.read.texture);
        blit(curl);

        // Vorticity
        bind(vorticityProgram);
        gl.uniform2f(vorticityUni.texelSize, 1.0 / config.SIM_RESOLUTION, 1.0 / config.SIM_RESOLUTION);
        gl.uniform1i(vorticityUni.uVelocity, velocity.read.texture);
        gl.uniform1i(vorticityUni.uCurl, curl.texture);
        gl.uniform1f(vorticityUni.curl, config.CURL);
        gl.uniform1f(vorticityUni.dt, dt);
        blit(velocity.write);
        velocity.swap();

        // Divergence
        bind(divergenceProgram);
        gl.uniform2f(divergenceUni.texelSize, 1.0 / config.SIM_RESOLUTION, 1.0 / config.SIM_RESOLUTION);
        gl.uniform1i(divergenceUni.uVelocity, velocity.read.texture);
        blit(divergence);

        // Clear pressure
        bind(clearProgram);
        gl.uniform1i(clearUni.uTexture, pressure.read.texture);
        gl.uniform1f(clearUni.value, config.PRESSURE);
        blit(pressure.write);
        pressure.swap();

        // Pressure solve
        bind(pressureProgram);
        gl.uniform2f(pressureUni.texelSize, 1.0 / config.SIM_RESOLUTION, 1.0 / config.SIM_RESOLUTION);
        gl.uniform1i(pressureUni.uDivergence, divergence.texture);
        for (let i = 0; i < config.PRESSURE_ITERATIONS; i++) {
            gl.uniform1i(pressureUni.uPressure, pressure.read.texture);
            blit(pressure.write);
            pressure.swap();
        }

        // Gradient subtract
        bind(gradientSubtractProgram);
        gl.uniform2f(gradientSubtractUni.texelSize, 1.0 / config.SIM_RESOLUTION, 1.0 / config.SIM_RESOLUTION);
        gl.uniform1i(gradientSubtractUni.uPressure, pressure.read.texture);
        gl.uniform1i(gradientSubtractUni.uVelocity, velocity.read.texture);
        blit(velocity.write);
        velocity.swap();

        // Advect velocity with noise
        bind(advectionProgram);
        gl.uniform2f(advectionUni.texelSize, 1.0 / config.SIM_RESOLUTION, 1.0 / config.SIM_RESOLUTION);
        gl.uniform2f(advectionUni.dyeTexelSize, 1.0 / config.SIM_RESOLUTION, 1.0 / config.SIM_RESOLUTION);
        gl.uniform1i(advectionUni.uVelocity, velocity.read.texture);
        gl.uniform1i(advectionUni.uSource, velocity.read.texture);
        gl.uniform1f(advectionUni.dt, dt);
        gl.uniform1f(advectionUni.dissipation, config.VELOCITY_DISSIPATION);
        gl.uniform1f(advectionUni.time, time);
        gl.uniform1f(advectionUni.noiseScale, config.NOISE_SCALE);
        gl.uniform1f(advectionUni.noiseWarp, config.NOBE_WARP);
        blit(velocity.write);
        velocity.swap();

        // Advect density with ethereal smoke
        bind(advectionProgram);
        gl.uniform2f(advectionUni.texelSize, 1.0 / config.DYE_RESOLUTION, 1.0 / config.DYE_RESOLUTION);
        gl.uniform2f(advectionUni.dyeTexelSize, 1.0 / config.DYE_RESOLUTION, 1.0 / config.DYE_RESOLUTION);
        gl.uniform1i(advectionUni.uVelocity, velocity.read.texture);
        gl.uniform1i(advectionUni.uSource, density.read.texture);
        gl.uniform1f(advectionUni.dissipation, config.DENSITY_DISSIPATION);
        blit(density.write);
        density.swap();
    }

    // ==================== INPUT ====================

    let lastX = 0, lastY = 0;
    let hasMoved = false;

    window.addEventListener('mousemove', e => {
        if (!hasMoved) {
            lastX = e.clientX;
            lastY = e.clientY;
            hasMoved = true;
            return;
        }

        const x = e.clientX / canvas.width;
        const y = 1.0 - e.clientY / canvas.height;
        const dx = (e.clientX - lastX) * config.SPLAT_FORCE / canvas.width;
        const dy = -(e.clientY - lastY) * config.SPLAT_FORCE / canvas.height;

        if (Math.abs(dx) > 0.1 || Math.abs(dy) > 0.1) {
            splat(x, y, dx * 0.5, dy * 0.5);
        }

        lastX = e.clientX;
        lastY = e.clientY;
    }, { passive: true });

    // ==================== LOOP ====================

    let lastTime = Date.now();

    function update() {
        const now = Date.now();
        const dt = Math.min((now - lastTime) / 1000, 0.016);
        lastTime = now;

        step(dt);

        // Display with ethereal glow
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
        bind(displayProgram);
        gl.uniform3f(displayUni.color, config.COLOR.r, config.COLOR.g, config.COLOR.b);
        gl.uniform1f(displayUni.opacity, config.OPACITY);
        gl.uniform1f(displayUni.time, time);
        gl.uniform1f(displayUni.noiseScale, config.NOISE_SCALE);
        gl.uniform1i(displayUni.uTexture, density.read.texture);
        blit(null);

        requestAnimationFrame(update);
    }

    console.log('Ethereal Fluid Smoke initialized');
    update();
})();
