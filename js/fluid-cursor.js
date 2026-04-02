/**
 * WebGL Fluid Simulation
 * Based on Jos Stam's "Real-Time Fluid Dynamics for Games"
 * https://paveldogreat.github.io/WebGL-Fluid-Simulation/
 */

(function() {
    'use strict';

    // Skip on touch devices
    if (window.matchMedia('(pointer: coarse)').matches) return;

    const canvas = document.getElementById('fluid-cursor');
    if (!canvas) return;

    // Get WebGL context
    const params = {
        alpha: true,
        depth: false,
        stencil: false,
        antialias: false,
        preserveDrawingBuffer: false
    };

    let gl = canvas.getContext('webgl2', params);
    const isWebGL2 = !!gl;
    if (!gl) gl = canvas.getContext('webgl', params) || canvas.getContext('experimental-webgl', params);
    if (!gl) {
        console.log('WebGL not supported');
        return;
    }

    // Configuration
    const config = {
        SIM_RESOLUTION: 128,
        DYE_RESOLUTION: 512,
        DENSITY_DISSIPATION: 1,
        VELOCITY_DISSIPATION: 0.2,
        PRESSURE: 0.8,
        PRESSURE_ITERATIONS: 20,
        CURL: 30,
        SPLAT_RADIUS: 0.25,
        SPLAT_FORCE: 6000,
        COLOR: { r: 0.65, g: 0.65, b: 0.64 },
        BACK_COLOR: { r: 0, g: 0, b: 0 }
    };

    // Resize
    function resize() {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
        gl.viewport(0, 0, canvas.width, canvas.height);
    }
    resize();
    window.addEventListener('resize', resize, { passive: true });

    // ==================== SHADERS ====================

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

    const copyShader = `
        precision highp float;
        precision highp sampler2D;
        varying vec2 vUv;
        uniform sampler2D uTexture;
        void main () {
            gl_FragColor = texture2D(uTexture, vUv);
        }
    `;

    const clearShader = `
        precision highp float;
        precision highp sampler2D;
        varying vec2 vUv;
        uniform sampler2D uTexture;
        uniform float value;
        void main () {
            gl_FragColor = value * texture2D(uTexture, vUv);
        }
    `;

    const displayShader = `
        precision highp float;
        precision highp sampler2D;
        varying vec2 vUv;
        uniform sampler2D uTexture;
        uniform vec3 color;
        uniform vec3 backColor;
        void main () {
            vec4 c = texture2D(uTexture, vUv);
            float avg = (c.r + c.g + c.b) / 3.0;
            vec3 fluidColor = mix(backColor, color, min(avg * 3.0, 1.0));
            gl_FragColor = vec4(fluidColor, c.a * 0.8);
        }
    `;

    const splatShader = `
        precision highp float;
        precision highp sampler2D;
        varying vec2 vUv;
        uniform sampler2D uTarget;
        uniform float aspectRatio;
        uniform vec3 color;
        uniform vec2 point;
        uniform float radius;
        void main () {
            vec2 p = vUv - point.xy;
            p.x *= aspectRatio;
            vec3 splat = exp(-dot(p, p) / radius) * color;
            vec3 base = texture2D(uTarget, vUv).xyz;
            gl_FragColor = vec4(base + splat, 1.0);
        }
    `;

    const advectionShader = `
        precision highp float;
        precision highp sampler2D;
        varying vec2 vUv;
        uniform sampler2D uVelocity;
        uniform sampler2D uSource;
        uniform vec2 texelSize;
        uniform vec2 dyeTexelSize;
        uniform float dt;
        uniform float dissipation;
        vec4 bilerp (sampler2D sam, vec2 uv, vec2 tsize) {
            vec2 st = uv / tsize - 0.5;
            vec2 iuv = floor(st);
            vec2 fuv = fract(st);
            vec4 a = texture2D(sam, (iuv + vec2(0.5, 0.5)) * tsize);
            vec4 b = texture2D(sam, (iuv + vec2(1.5, 0.5)) * tsize);
            vec4 c = texture2D(sam, (iuv + vec2(0.5, 1.5)) * tsize);
            vec4 d = texture2D(sam, (iuv + vec2(1.5, 1.5)) * tsize);
            return mix(mix(a, b, fuv.x), mix(c, d, fuv.x), fuv.y);
        }
        void main () {
            vec2 coord = vUv - dt * bilerp(uVelocity, vUv, texelSize).xy * texelSize;
            gl_FragColor = dissipation * bilerp(uSource, coord, dyeTexelSize);
        }
    `;

    const divergenceShader = `
        precision highp float;
        precision highp sampler2D;
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

    const curlShader = `
        precision highp float;
        precision highp sampler2D;
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
        precision highp sampler2D;
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

    const pressureShader = `
        precision highp float;
        precision highp sampler2D;
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
        precision highp sampler2D;
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

    // ==================== WEBGL UTILS ====================

    function createShader(type, source) {
        const shader = gl.createShader(type);
        gl.shaderSource(shader, source);
        gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
            console.error('Shader compile error:', gl.getShaderInfoLog(shader));
            gl.deleteShader(shader);
            return null;
        }
        return shader;
    }

    function createProgram(vertexSource, fragmentSource) {
        const vertexShader = createShader(gl.VERTEX_SHADER, vertexSource);
        const fragmentShader = createShader(gl.FRAGMENT_SHADER, fragmentSource);
        if (!vertexShader || !fragmentShader) return null;

        const program = gl.createProgram();
        gl.attachShader(program, vertexShader);
        gl.attachShader(program, fragmentShader);
        gl.linkProgram(program);

        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
            console.error('Program link error:', gl.getProgramInfoLog(program));
            return null;
        }
        return program;
    }

    function getUniforms(program) {
        const uniforms = {};
        const uniformCount = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS);
        for (let i = 0; i < uniformCount; i++) {
            const uniformName = gl.getActiveUniform(program, i).name;
            uniforms[uniformName] = gl.getUniformLocation(program, uniformName);
        }
        return uniforms;
    }

    // ==================== FBO ====================

    class FBO {
        constructor(width, height, internalFormat, format, type, param) {
            this.width = width;
            this.height = height;
            this.texture = gl.createTexture();
            gl.bindTexture(gl.TEXTURE_2D, this.texture);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, param);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, param);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
            gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, width, height, 0, format, type, null);

            this.fbo = gl.createFramebuffer();
            gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
            gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.texture, 0);
            gl.viewport(0, 0, width, height);
            gl.clear(gl.COLOR_BUFFER_BIT);
        }
    }

    class DoubleFBO {
        constructor(width, height, internalFormat, format, type, param) {
            this.read = new FBO(width, height, internalFormat, format, type, param);
            this.write = new FBO(width, height, internalFormat, format, type, param);
        }
        swap() {
            const temp = this.read;
            this.read = this.write;
            this.write = temp;
        }
    }

    // Check extensions
    let halfFloat;
    let supportLinearFiltering;
    if (isWebGL2) {
        gl.getExtension('EXT_color_buffer_float');
        supportLinearFiltering = gl.getExtension('OES_texture_float_linear');
    } else {
        halfFloat = gl.getExtension('OES_texture_half_float');
        supportLinearFiltering = gl.getExtension('OES_texture_half_float_linear');
    }

    const halfFloatTexType = isWebGL2 ? gl.HALF_FLOAT : halfFloat.HALF_FLOAT_OES;
    let rgba;
    if (isWebGL2) {
        rgba = { internalFormat: gl.RGBA16F, format: gl.RGBA, type: halfFloatTexType };
    } else {
        rgba = { internalFormat: gl.RGBA, format: gl.RGBA, type: halfFloatTexType };
    }

    const filtering = supportLinearFiltering ? gl.LINEAR : gl.NEAREST;

    // Create FBOs
    const velocity = new DoubleFBO(config.SIM_RESOLUTION, config.SIM_RESOLUTION, rgba.internalFormat, rgba.format, rgba.type, filtering);
    const density = new DoubleFBO(config.DYE_RESOLUTION, config.DYE_RESOLUTION, rgba.internalFormat, rgba.format, rgba.type, filtering);
    const pressure = new DoubleFBO(config.SIM_RESOLUTION, config.SIM_RESOLUTION, rgba.internalFormat, rgba.format, rgba.type, gl.NEAREST);
    const divergence = new FBO(config.SIM_RESOLUTION, config.SIM_RESOLUTION, rgba.internalFormat, rgba.format, rgba.type, gl.NEAREST);
    const curl = new FBO(config.SIM_RESOLUTION, config.SIM_RESOLUTION, rgba.internalFormat, rgba.format, rgba.type, gl.NEAREST);

    // ==================== PROGRAMS ====================

    const copyProgram = createProgram(baseVertexShader, copyShader);
    const clearProgram = createProgram(baseVertexShader, clearShader);
    const splatProgram = createProgram(baseVertexShader, splatShader);
    const advectionProgram = createProgram(baseVertexShader, advectionShader);
    const divergenceProgram = createProgram(baseVertexShader, divergenceShader);
    const curlProgram = createProgram(baseVertexShader, curlShader);
    const vorticityProgram = createProgram(baseVertexShader, vorticityShader);
    const pressureProgram = createProgram(baseVertexShader, pressureShader);
    const gradienSubtractProgram = createProgram(baseVertexShader, gradientSubtractShader);
    const displayProgram = createProgram(baseVertexShader, displayShader);

    if (!copyProgram || !displayProgram) {
        console.error('Failed to create required programs');
        return;
    }

    const copyUni = getUniforms(copyProgram);
    const clearUni = getUniforms(clearProgram);
    const splatUni = getUniforms(splatProgram);
    const advectionUni = getUniforms(advectionProgram);
    const divergenceUni = getUniforms(divergenceProgram);
    const curlUni = getUniforms(curlProgram);
    const vorticityUni = getUniforms(vorticityProgram);
    const pressureUni = getUniforms(pressureProgram);
    const gradientSubtractUni = getUniforms(gradienSubtractProgram);
    const displayUni = getUniforms(displayProgram);

    // ==================== BLIT ====================

    const blitVertexBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, blitVertexBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, -1, 1, 1, 1, 1, -1]), gl.STATIC_DRAW);

    const blitIndexBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, blitIndexBuffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array([0, 1, 2, 0, 2, 3]), gl.STATIC_DRAW);

    function blit(target) {
        if (target == null) {
            gl.viewport(0, 0, canvas.width, canvas.height);
            gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        } else {
            gl.viewport(0, 0, target.width, target.height);
            gl.bindFramebuffer(gl.FRAMEBUFFER, target.fbo);
        }
        gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);
    }

    function bindProgram(program) {
        gl.useProgram(program);
        gl.bindBuffer(gl.ARRAY_BUFFER, blitVertexBuffer);
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, blitIndexBuffer);
        const positionLocation = gl.getAttribLocation(program, 'aPosition');
        gl.enableVertexAttribArray(positionLocation);
        gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);
    }

    // ==================== SIMULATION ====================

    function splat(x, y, dx, dy, color) {
        bindProgram(splatProgram);
        gl.uniform1i(splatUni.uTarget, density.read.texture);
        gl.uniform1f(splatUni.aspectRatio, canvas.width / canvas.height);
        gl.uniform3f(splatUni.color, color.r, color.g, color.b);
        gl.uniform2f(splatUni.point, x, y);
        gl.uniform1f(splatUni.radius, config.SPLAT_RADIUS / 10.0);
        blit(density.write);
        density.swap();

        bindProgram(splatProgram);
        gl.uniform1i(splatUni.uTarget, velocity.read.texture);
        gl.uniform3f(splatUni.color, dx, dy, 0.0);
        gl.uniform1f(splatUni.radius, config.SPLAT_RADIUS / 10.0);
        blit(velocity.write);
        velocity.swap();
    }

    function step(dt) {
        gl.disable(gl.BLEND);

        bindProgram(curlProgram);
        gl.uniform2f(curlUni.texelSize, 1.0 / config.SIM_RESOLUTION, 1.0 / config.SIM_RESOLUTION);
        gl.uniform1i(curlUni.uVelocity, velocity.read.texture);
        blit(curl);

        bindProgram(vorticityProgram);
        gl.uniform2f(vorticityUni.texelSize, 1.0 / config.SIM_RESOLUTION, 1.0 / config.SIM_RESOLUTION);
        gl.uniform1i(vorticityUni.uVelocity, velocity.read.texture);
        gl.uniform1i(vorticityUni.uCurl, curl.texture);
        gl.uniform1f(vorticityUni.curl, config.CURL);
        gl.uniform1f(vorticityUni.dt, dt);
        blit(velocity.write);
        velocity.swap();

        bindProgram(divergenceProgram);
        gl.uniform2f(divergenceUni.texelSize, 1.0 / config.SIM_RESOLUTION, 1.0 / config.SIM_RESOLUTION);
        gl.uniform1i(divergenceUni.uVelocity, velocity.read.texture);
        blit(divergence);

        bindProgram(clearProgram);
        gl.uniform1i(clearUni.uTexture, pressure.read.texture);
        gl.uniform1f(clearUni.value, config.PRESSURE);
        blit(pressure.write);
        pressure.swap();

        bindProgram(pressureProgram);
        gl.uniform2f(pressureUni.texelSize, 1.0 / config.SIM_RESOLUTION, 1.0 / config.SIM_RESOLUTION);
        gl.uniform1i(pressureUni.uDivergence, divergence.texture);
        for (let i = 0; i < config.PRESSURE_ITERATIONS; i++) {
            gl.uniform1i(pressureUni.uPressure, pressure.read.texture);
            blit(pressure.write);
            pressure.swap();
        }

        bindProgram(gradienSubtractProgram);
        gl.uniform2f(gradientSubtractUni.texelSize, 1.0 / config.SIM_RESOLUTION, 1.0 / config.SIM_RESOLUTION);
        gl.uniform1i(gradientSubtractUni.uPressure, pressure.read.texture);
        gl.uniform1i(gradientSubtractUni.uVelocity, velocity.read.texture);
        blit(velocity.write);
        velocity.swap();

        bindProgram(advectionProgram);
        gl.uniform2f(advectionUni.texelSize, 1.0 / config.SIM_RESOLUTION, 1.0 / config.SIM_RESOLUTION);
        gl.uniform1i(advectionUni.uVelocity, velocity.read.texture);
        gl.uniform1i(advectionUni.uSource, velocity.read.texture);
        gl.uniform1f(advectionUni.dt, dt);
        gl.uniform1f(advectionUni.dissipation, Math.pow(config.VELOCITY_DISSIPATION, 0.1));
        blit(velocity.write);
        velocity.swap();

        bindProgram(advectionProgram);
        gl.uniform2f(advectionUni.texelSize, 1.0 / config.DYE_RESOLUTION, 1.0 / config.DYE_RESOLUTION);
        gl.uniform2f(advectionUni.dyeTexelSize, 1.0 / config.DYE_RESOLUTION, 1.0 / config.DYE_RESOLUTION);
        gl.uniform1i(advectionUni.uVelocity, velocity.read.texture);
        gl.uniform1i(advectionUni.uSource, density.read.texture);
        gl.uniform1f(advectionUni.dt, dt);
        gl.uniform1f(advectionUni.dissipation, Math.pow(config.DENSITY_DISSIPATION, 0.05));
        blit(density.write);
        density.swap();
    }

    // ==================== INPUT ====================

    let lastMouseX = 0;
    let lastMouseY = 0;
    let hasMoved = false;

    window.addEventListener('mousemove', e => {
        if (!hasMoved) {
            lastMouseX = e.clientX;
            lastMouseY = e.clientY;
            hasMoved = true;
            return;
        }

        const x = e.clientX / canvas.width;
        const y = 1.0 - e.clientY / canvas.height;
        const dx = (e.clientX - lastMouseX) * config.SPLAT_FORCE / canvas.width;
        const dy = -(e.clientY - lastMouseY) * config.SPLAT_FORCE / canvas.height;

        if (Math.abs(dx) > 0 || Math.abs(dy) > 0) {
            splat(x, y, dx, dy, config.COLOR);
        }

        lastMouseX = e.clientX;
        lastMouseY = e.clientY;
    }, { passive: true });

    // Initial splat
    setTimeout(() => splat(0.5, 0.5, 500, 500, config.COLOR), 100);

    // ==================== RENDER LOOP ====================

    let lastTime = Date.now();

    function update() {
        const now = Date.now();
        const dt = Math.min((now - lastTime) / 1000, 0.016);
        lastTime = now;

        step(dt);

        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
        bindProgram(displayProgram);
        gl.uniform3f(displayUni.color, config.COLOR.r, config.COLOR.g, config.COLOR.b);
        gl.uniform3f(displayUni.backColor, config.BACK_COLOR.r, config.BACK_COLOR.g, config.BACK_COLOR.b);
        gl.uniform1i(displayUni.uTexture, density.read.texture);
        blit(null);

        requestAnimationFrame(update);
    }

    console.log('WebGL Fluid Simulation initialized');
    update();
})();
