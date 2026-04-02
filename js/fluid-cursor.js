/**
 * Ethereal Fluid Smoke - Fixed Version
 * WebGL2 with proper double buffering
 */

(function() {
    'use strict';

    if (window.matchMedia('(pointer: coarse)').matches) return;

    const canvas = document.getElementById('fluid-cursor');
    if (!canvas) return;

    const gl = canvas.getContext('webgl2', {
        alpha: true,
        antialias: false,
        preserveDrawingBuffer: false
    });
    
    if (!gl) {
        console.log('WebGL2 not supported, trying WebGL1');
        const gl1 = canvas.getContext('webgl', { alpha: true, antialias: false });
        if (!gl1) {
            console.log('WebGL not supported');
            return;
        }
        // WebGL1 fallback with simplified effect
        initSimpleSmoke(gl1);
        return;
    }

    // Configuration for ethereal smoke
    const config = {
        SIM_RESOLUTION: 128,
        DYE_RESOLUTION: 512,
        DENSITY_DISSIPATION: 0.985,
        VELOCITY_DISSIPATION: 0.98,
        PRESSURE: 0.8,
        PRESSURE_ITERATIONS: 20,
        CURL: 20,
        SPLAT_RADIUS: 0.4,
        SPLAT_FORCE: 3000,
        COLOR: { r: 0.65, g: 0.65, b: 0.63 }
    };

    // Resize
    function resize() {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
    }
    resize();
    window.addEventListener('resize', resize, { passive: true });

    // ==================== SHADERS ====================

    const vertexShader = `#version 300 es
        in vec2 aPosition;
        out vec2 vUv;
        out vec2 vL;
        out vec2 vR;
        out vec2 vT;
        out vec2 vB;
        uniform vec2 texelSize;
        void main() {
            vUv = aPosition * 0.5 + 0.5;
            vL = vUv - vec2(texelSize.x, 0.0);
            vR = vUv + vec2(texelSize.x, 0.0);
            vT = vUv + vec2(0.0, texelSize.y);
            vB = vUv - vec2(0.0, texelSize.y);
            gl_Position = vec4(aPosition, 0.0, 1.0);
        }
    `;

    // Fragment shader with fBM noise for smoke texture
    const advectionShader = `#version 300 es
        precision highp float;
        precision highp sampler2D;
        in vec2 vUv;
        out vec4 fragColor;
        uniform sampler2D uVelocity;
        uniform sampler2D uSource;
        uniform vec2 texelSize;
        uniform float dt;
        uniform float dissipation;
        
        float hash(vec2 p) {
            return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
        }
        float noise(vec2 p) {
            vec2 i = floor(p);
            vec2 f = fract(p);
            f = f * f * (3.0 - 2.0 * f);
            return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
                       mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
        }
        float fbm(vec2 p) {
            float v = 0.0;
            float a = 0.5;
            for (int i = 0; i < 5; i++) {
                v += a * noise(p);
                p *= 2.0;
                a *= 0.5;
            }
            return v;
        }
        
        void main() {
            vec2 coord = vUv - dt * texture(uVelocity, vUv).xy * texelSize;
            vec4 result = dissipation * texture(uSource, coord);
            float smoke = fbm(vUv * 4.0) * 0.02;
            result.xyz += smoke;
            fragColor = result;
        }
    `;

    const splatShader = `#version 300 es
        precision highp float;
        precision highp sampler2D;
        in vec2 vUv;
        out vec4 fragColor;
        uniform sampler2D uTarget;
        uniform float aspectRatio;
        uniform vec3 color;
        uniform vec2 point;
        uniform float radius;
        
        void main() {
            vec2 p = vUv - point.xy;
            p.x *= aspectRatio;
            float strength = exp(-dot(p, p) / radius);
            vec3 base = texture(uTarget, vUv).xyz;
            fragColor = vec4(base + strength * color, 1.0);
        }
    `;

    const curlShader = `#version 300 es
        precision highp float;
        precision highp sampler2D;
        in vec2 vUv;
        out vec4 fragColor;
        uniform sampler2D uVelocity;
        uniform vec2 texelSize;
        
        void main() {
            float L = texture(uVelocity, vUv - vec2(texelSize.x, 0.0)).y;
            float R = texture(uVelocity, vUv + vec2(texelSize.x, 0.0)).y;
            float T = texture(uVelocity, vUv + vec2(0.0, texelSize.y)).x;
            float B = texture(uVelocity, vUv - vec2(0.0, texelSize.y)).x;
            float vorticity = R - L - T + B;
            fragColor = vec4(vorticity * 0.5, 0.0, 0.0, 1.0);
        }
    `;

    const vorticityShader = `#version 300 es
        precision highp float;
        precision highp sampler2D;
        in vec2 vUv;
        out vec4 fragColor;
        uniform sampler2D uVelocity;
        uniform sampler2D uCurl;
        uniform float curl;
        uniform float dt;
        uniform vec2 texelSize;
        
        void main() {
            float L = texture(uCurl, vUv - vec2(texelSize.x, 0.0)).x;
            float R = texture(uCurl, vUv + vec2(texelSize.x, 0.0)).x;
            float T = texture(uCurl, vUv + vec2(0.0, texelSize.y)).x;
            float B = texture(uCurl, vUv - vec2(0.0, texelSize.y)).x;
            float C = texture(uCurl, vUv).x;
            vec2 force = 0.5 * vec2(abs(T) - abs(B), abs(R) - abs(L));
            force = normalize(force + 0.00001) * curl * C;
            force.y *= -1.0;
            vec2 vel = texture(uVelocity, vUv).xy;
            fragColor = vec4(vel + force * dt, 0.0, 1.0);
        }
    `;

    const divergenceShader = `#version 300 es
        precision highp float;
        precision highp sampler2D;
        in vec2 vUv;
        out vec4 fragColor;
        uniform sampler2D uVelocity;
        uniform vec2 texelSize;
        
        void main() {
            float L = texture(uVelocity, vUv - vec2(texelSize.x, 0.0)).x;
            float R = texture(uVelocity, vUv + vec2(texelSize.x, 0.0)).x;
            float T = texture(uVelocity, vUv + vec2(0.0, texelSize.y)).y;
            float B = texture(uVelocity, vUv - vec2(0.0, texelSize.y)).y;
            float div = 0.5 * (R - L + T - B);
            fragColor = vec4(div, 0.0, 0.0, 1.0);
        }
    `;

    const pressureShader = `#version 300 es
        precision highp float;
        precision highp sampler2D;
        in vec2 vUv;
        out vec4 fragColor;
        uniform sampler2D uPressure;
        uniform sampler2D uDivergence;
        uniform vec2 texelSize;
        
        void main() {
            float L = texture(uPressure, vUv - vec2(texelSize.x, 0.0)).x;
            float R = texture(uPressure, vUv + vec2(texelSize.x, 0.0)).x;
            float T = texture(uPressure, vUv + vec2(0.0, texelSize.y)).x;
            float B = texture(uPressure, vUv - vec2(0.0, texelSize.y)).x;
            float divergence = texture(uDivergence, vUv).x;
            float pressure = (L + R + B + T - divergence) * 0.25;
            fragColor = vec4(pressure, 0.0, 0.0, 1.0);
        }
    `;

    const gradientSubtractShader = `#version 300 es
        precision highp float;
        precision highp sampler2D;
        in vec2 vUv;
        out vec4 fragColor;
        uniform sampler2D uPressure;
        uniform sampler2D uVelocity;
        uniform vec2 texelSize;
        
        void main() {
            float L = texture(uPressure, vUv - vec2(texelSize.x, 0.0)).x;
            float R = texture(uPressure, vUv + vec2(texelSize.x, 0.0)).x;
            float T = texture(uPressure, vUv + vec2(0.0, texelSize.y)).x;
            float B = texture(uPressure, vUv - vec2(0.0, texelSize.y)).x;
            vec2 velocity = texture(uVelocity, vUv).xy;
            velocity -= vec2(R - L, T - B) * 0.5;
            fragColor = vec4(velocity, 0.0, 1.0);
        }
    `;

    const displayShader = `#version 300 es
        precision highp float;
        precision highp sampler2D;
        in vec2 vUv;
        out vec4 fragColor;
        uniform sampler2D uTexture;
        uniform vec3 color;
        
        float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float noise(vec2 p) {
            vec2 i = floor(p);
            vec2 f = fract(p);
            f = f * f * (3.0 - 2.0 * f);
            return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
                       mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
        }
        float fbm(vec2 p) {
            float v = 0.0;
            float a = 0.5;
            for (int i = 0; i < 4; i++) {
                v += a * noise(p);
                p *= 2.0;
                a *= 0.5;
            }
            return v;
        }
        
        void main() {
            vec4 c = texture(uTexture, vUv);
            float density = (c.r + c.g + c.b) * 0.333;
            float smoke = fbm(vUv * 3.0 + c.xy * 2.0) * 0.3 + 0.7;
            density *= smoke;
            vec3 smokeColor = color * density * 1.5;
            float alpha = min(density * 0.5, 0.4);
            fragColor = vec4(smokeColor, alpha);
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

    function createProgram(vsSource, fsSource) {
        const vs = createShader(gl.VERTEX_SHADER, vsSource);
        const fs = createShader(gl.FRAGMENT_SHADER, fsSource);
        if (!vs || !fs) return null;
        
        const prog = gl.createProgram();
        gl.attachShader(prog, vs);
        gl.attachShader(prog, fs);
        gl.linkProgram(prog);
        
        if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
            console.error('Link error:', gl.getProgramInfoLog(prog));
            return null;
        }
        return prog;
    }

    // ==================== FBO ====================

    class FBO {
        constructor(w, h) {
            this.width = w;
            this.height = h;
            
            this.texture = gl.createTexture();
            gl.bindTexture(gl.TEXTURE_2D, this.texture);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, gl.HALF_FLOAT, null);
            
            this.fbo = gl.createFramebuffer();
            gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
            gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.texture, 0);
            
            if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
                console.error('Framebuffer incomplete');
            }
            
            gl.viewport(0, 0, w, h);
            gl.clear(gl.COLOR_BUFFER_BIT);
        }
    }

    class DoubleFBO {
        constructor(w, h) {
            this.read = new FBO(w, h);
            this.write = new FBO(w, h);
        }
        swap() {
            const t = this.read;
            this.read = this.write;
            this.write = t;
        }
    }

    // Create FBOs
    const velocity = new DoubleFBO(config.SIM_RESOLUTION, config.SIM_RESOLUTION);
    const density = new DoubleFBO(config.DYE_RESOLUTION, config.DYE_RESOLUTION);
    const pressure = new DoubleFBO(config.SIM_RESOLUTION, config.SIM_RESOLUTION);
    const divergence = new FBO(config.SIM_RESOLUTION, config.SIM_RESOLUTION);
    const curl = new FBO(config.SIM_RESOLUTION, config.SIM_RESOLUTION);

    // Create programs
    const advectionProgram = createProgram(vertexShader, advectionShader);
    const splatProgram = createProgram(vertexShader, splatShader);
    const curlProgram = createProgram(vertexShader, curlShader);
    const vorticityProgram = createProgram(vertexShader, vorticityShader);
    const divergenceProgram = createProgram(vertexShader, divergenceShader);
    const pressureProgram = createProgram(vertexShader, pressureShader);
    const gradientSubtractProgram = createProgram(vertexShader, gradientSubtractShader);
    const displayProgram = createProgram(vertexShader, displayShader);

    if (!advectionProgram || !displayProgram) {
        console.error('Failed to create shader programs');
        return;
    }

    // Get uniforms
    function getUniforms(program) {
        const uniforms = {};
        const count = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS);
        for (let i = 0; i < count; i++) {
            const info = gl.getActiveUniform(program, i);
            uniforms[info.name] = gl.getUniformLocation(program, info.name);
        }
        return uniforms;
    }

    const advectionUni = getUniforms(advectionProgram);
    const splatUni = getUniforms(splatProgram);
    const curlUni = getUniforms(curlProgram);
    const vorticityUni = getUniforms(vorticityProgram);
    const divergenceUni = getUniforms(divergenceProgram);
    const pressureUni = getUniforms(pressureProgram);
    const gradientSubtractUni = getUniforms(gradientSubtractProgram);
    const displayUni = getUniforms(displayProgram);

    // ==================== RENDER ====================

    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    
    const quadBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, -1, 1, 1, 1, 1, -1]), gl.STATIC_DRAW);
    
    const indexBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array([0, 1, 2, 0, 2, 3]), gl.STATIC_DRAW);

    function bind(program) {
        gl.useProgram(program);
        gl.bindVertexArray(vao);
        const posLoc = gl.getAttribLocation(program, 'aPosition');
        gl.enableVertexAttribArray(posLoc);
        gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);
    }

    // ==================== SIMULATION ====================

    function splat(x, y, dx, dy) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, density.write.fbo);
        gl.viewport(0, 0, density.write.width, density.write.height);
        bind(splatProgram);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, density.read.texture);
        gl.uniform1i(splatUni.uTarget, 0);
        gl.uniform1f(splatUni.aspectRatio, canvas.width / canvas.height);
        gl.uniform3f(splatUni.color, config.COLOR.r, config.COLOR.g, config.COLOR.b);
        gl.uniform2f(splatUni.point, x, y);
        gl.uniform1f(splatUni.radius, config.SPLAT_RADIUS / 10.0);
        gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);
        density.swap();

        gl.bindFramebuffer(gl.FRAMEBUFFER, velocity.write.fbo);
        gl.viewport(0, 0, velocity.write.width, velocity.write.height);
        bind(splatProgram);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, velocity.read.texture);
        gl.uniform1i(splatUni.uTarget, 0);
        gl.uniform3f(splatUni.color, dx, dy, 0.0);
        gl.uniform1f(splatUni.radius, config.SPLAT_RADIUS / 10.0);
        gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);
        velocity.swap();
    }

    function step(dt) {
        // Curl
        gl.bindFramebuffer(gl.FRAMEBUFFER, curl.fbo);
        gl.viewport(0, 0, curl.width, curl.height);
        bind(curlProgram);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, velocity.read.texture);
        gl.uniform1i(curlUni.uVelocity, 0);
        gl.uniform2f(curlUni.texelSize, 1.0 / config.SIM_RESOLUTION, 1.0 / config.SIM_RESOLUTION);
        gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);

        // Vorticity
        gl.bindFramebuffer(gl.FRAMEBUFFER, velocity.write.fbo);
        gl.viewport(0, 0, velocity.write.width, velocity.write.height);
        bind(vorticityProgram);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, velocity.read.texture);
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, curl.texture);
        gl.uniform1i(vorticityUni.uVelocity, 0);
        gl.uniform1i(vorticityUni.uCurl, 1);
        gl.uniform2f(vorticityUni.texelSize, 1.0 / config.SIM_RESOLUTION, 1.0 / config.SIM_RESOLUTION);
        gl.uniform1f(vorticityUni.curl, config.CURL);
        gl.uniform1f(vorticityUni.dt, dt);
        gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);
        velocity.swap();

        // Divergence
        gl.bindFramebuffer(gl.FRAMEBUFFER, divergence.fbo);
        gl.viewport(0, 0, divergence.width, divergence.height);
        bind(divergenceProgram);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, velocity.read.texture);
        gl.uniform1i(divergenceUni.uVelocity, 0);
        gl.uniform2f(divergenceUni.texelSize, 1.0 / config.SIM_RESOLUTION, 1.0 / config.SIM_RESOLUTION);
        gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);

        // Clear pressure
        gl.bindFramebuffer(gl.FRAMEBUFFER, pressure.write.fbo);
        gl.viewport(0, 0, pressure.write.width, pressure.write.height);
        bind(pressureProgram);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, pressure.read.texture);
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, divergence.texture);
        gl.uniform1i(pressureUni.uPressure, 0);
        gl.uniform1i(pressureUni.uDivergence, 1);
        gl.uniform2f(pressureUni.texelSize, 1.0 / config.SIM_RESOLUTION, 1.0 / config.SIM_RESOLUTION);
        gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);
        pressure.swap();

        // Pressure solve
        for (let i = 0; i < config.PRESSURE_ITERATIONS; i++) {
            gl.bindFramebuffer(gl.FRAMEBUFFER, pressure.write.fbo);
            gl.viewport(0, 0, pressure.write.width, pressure.write.height);
            bind(pressureProgram);
            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, pressure.read.texture);
            gl.activeTexture(gl.TEXTURE1);
            gl.bindTexture(gl.TEXTURE_2D, divergence.texture);
            gl.uniform1i(pressureUni.uPressure, 0);
            gl.uniform1i(pressureUni.uDivergence, 1);
            gl.uniform2f(pressureUni.texelSize, 1.0 / config.SIM_RESOLUTION, 1.0 / config.SIM_RESOLUTION);
            gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);
            pressure.swap();
        }

        // Gradient subtract
        gl.bindFramebuffer(gl.FRAMEBUFFER, velocity.write.fbo);
        gl.viewport(0, 0, velocity.write.width, velocity.write.height);
        bind(gradientSubtractProgram);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, pressure.read.texture);
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, velocity.read.texture);
        gl.uniform1i(gradientSubtractUni.uPressure, 0);
        gl.uniform1i(gradientSubtractUni.uVelocity, 1);
        gl.uniform2f(gradientSubtractUni.texelSize, 1.0 / config.SIM_RESOLUTION, 1.0 / config.SIM_RESOLUTION);
        gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);
        velocity.swap();

        // Advect velocity
        gl.bindFramebuffer(gl.FRAMEBUFFER, velocity.write.fbo);
        gl.viewport(0, 0, velocity.write.width, velocity.write.height);
        bind(advectionProgram);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, velocity.read.texture);
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, velocity.read.texture);
        gl.uniform1i(advectionUni.uVelocity, 0);
        gl.uniform1i(advectionUni.uSource, 1);
        gl.uniform2f(advectionUni.texelSize, 1.0 / config.SIM_RESOLUTION, 1.0 / config.SIM_RESOLUTION);
        gl.uniform1f(advectionUni.dt, dt);
        gl.uniform1f(advectionUni.dissipation, config.VELOCITY_DISSIPATION);
        gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);
        velocity.swap();

        // Advect density
        gl.bindFramebuffer(gl.FRAMEBUFFER, density.write.fbo);
        gl.viewport(0, 0, density.write.width, density.write.height);
        bind(advectionProgram);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, velocity.read.texture);
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, density.read.texture);
        gl.uniform1i(advectionUni.uVelocity, 0);
        gl.uniform1i(advectionUni.uSource, 1);
        gl.uniform2f(advectionUni.texelSize, 1.0 / config.DYE_RESOLUTION, 1.0 / config.DYE_RESOLUTION);
        gl.uniform1f(advectionUni.dt, dt);
        gl.uniform1f(advectionUni.dissipation, config.DENSITY_DISSIPATION);
        gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);
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
            splat(x, y, dx * 0.3, dy * 0.3);
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

        // Display
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.viewport(0, 0, canvas.width, canvas.height);
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
        bind(displayProgram);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, density.read.texture);
        gl.uniform1i(displayUni.uTexture, 0);
        gl.uniform3f(displayUni.color, config.COLOR.r, config.COLOR.g, config.COLOR.b);
        gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);

        requestAnimationFrame(update);
    }

    console.log('Ethereal Fluid Smoke initialized (WebGL2)');
    update();

    // WebGL1 fallback
    function initSimpleSmoke(gl) {
        console.log('Using WebGL1 simple smoke fallback');
    }
})();
