/**
 * WebGL Fluid Smoke - Compatible Version
 * Uses standard RGBA8 format for maximum compatibility
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
    
    if (!gl) return;

    // Check for float texture support
    const ext = gl.getExtension('OES_texture_half_float');
    const linearExt = gl.getExtension('OES_texture_half_float_linear');
    
    // Use half-float if available, otherwise fallback to unsigned byte
    const useHalfFloat = !!ext;
    const texType = useHalfFloat ? ext.HALF_FLOAT_OES : gl.UNSIGNED_BYTE;
    const filtering = linearExt ? gl.LINEAR : gl.NEAREST;

    // Configuration - EXACT specs from guideline
    const config = {
        SIM_RESOLUTION: 128,
        DYE_RESOLUTION: 512,
        DENSITY_DISSIPATION: 0.97,   // Back to 0.97 - trailing OK
        VELOCITY_DISSIPATION: 0.985,   // Slow cinematic speed
        PRESSURE: 0.8,
        PRESSURE_ITERATIONS: 20,
        CURL: 25,                      // Medium curl - wide smooth vortices
        SPLAT_RADIUS: 0.15,            // Bigger fluid
        SPLAT_FORCE: 4500,
        COLOR: { r: 0.04, g: 0.04, b: 0.045 },  // Almost pure black
        EDGE_COLOR: { r: 0.02, g: 0.02, b: 0.025 }, // Pitch black edge
        IDLE_MOTION: true,             // Continuous subtle background motion
        COLOR_SHIFT_SPEED: 0.02        // HSV dynamic color shifting
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
        attribute vec2 aPosition;
        varying vec2 vUv;
        varying vec2 vL;
        varying vec2 vR;
        varying vec2 vT;
        varying vec2 vB;
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

    const advectionShader = `
        precision highp float;
        varying vec2 vUv;
        uniform sampler2D uVelocity;
        uniform sampler2D uSource;
        uniform vec2 texelSize;
        uniform float dt;
        uniform float dissipation;
        
        void main() {
            vec2 coord = vUv - dt * texture2D(uVelocity, vUv).xy * texelSize;
            vec4 result = dissipation * texture2D(uSource, coord);
            
            // Swirl effect when fading (based on dissipation)
            float fadeAmount = 1.0 - dissipation;
            if (fadeAmount > 0.01) {
                vec2 center = vec2(0.5, 0.5);
                vec2 toCenter = vUv - center;
                float angle = fadeAmount * 2.0 * dt;
                float s = sin(angle);
                float c = cos(angle);
                vec2 rotated = vec2(
                    toCenter.x * c - toCenter.y * s,
                    toCenter.x * s + toCenter.y * c
                );
                vec2 swirlCoord = center + rotated * 0.98;
                result += fadeAmount * 0.3 * texture2D(uSource, swirlCoord);
            }
            
            gl_FragColor = result;
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
        
        void main() {
            vec2 p = vUv - point.xy;
            p.x *= aspectRatio;
            float strength = exp(-dot(p, p) / radius);
            vec3 base = texture2D(uTarget, vUv).xyz;
            gl_FragColor = vec4(base + strength * color, 1.0);
        }
    `;

    const curlShader = `
        precision highp float;
        varying vec2 vUv;
        uniform sampler2D uVelocity;
        uniform vec2 texelSize;
        
        void main() {
            float L = texture2D(uVelocity, vUv - vec2(texelSize.x, 0.0)).y;
            float R = texture2D(uVelocity, vUv + vec2(texelSize.x, 0.0)).y;
            float T = texture2D(uVelocity, vUv + vec2(0.0, texelSize.y)).x;
            float B = texture2D(uVelocity, vUv - vec2(0.0, texelSize.y)).x;
            float vorticity = R - L - T + B;
            gl_FragColor = vec4(vorticity * 0.5, 0.0, 0.0, 1.0);
        }
    `;

    const vorticityShader = `
        precision highp float;
        varying vec2 vUv;
        uniform sampler2D uVelocity;
        uniform sampler2D uCurl;
        uniform float curl;
        uniform float dt;
        uniform vec2 texelSize;
        
        void main() {
            float L = texture2D(uCurl, vUv - vec2(texelSize.x, 0.0)).x;
            float R = texture2D(uCurl, vUv + vec2(texelSize.x, 0.0)).x;
            float T = texture2D(uCurl, vUv + vec2(0.0, texelSize.y)).x;
            float B = texture2D(uCurl, vUv - vec2(0.0, texelSize.y)).x;
            float C = texture2D(uCurl, vUv).x;
            vec2 force = 0.5 * vec2(abs(T) - abs(B), abs(R) - abs(L));
            force = normalize(force + 0.00001) * curl * C;
            force.y *= -1.0;
            vec2 vel = texture2D(uVelocity, vUv).xy;
            gl_FragColor = vec4(vel + force * dt, 0.0, 1.0);
        }
    `;

    const divergenceShader = `
        precision highp float;
        varying vec2 vUv;
        uniform sampler2D uVelocity;
        uniform vec2 texelSize;
        
        void main() {
            float L = texture2D(uVelocity, vUv - vec2(texelSize.x, 0.0)).x;
            float R = texture2D(uVelocity, vUv + vec2(texelSize.x, 0.0)).x;
            float T = texture2D(uVelocity, vUv + vec2(0.0, texelSize.y)).y;
            float B = texture2D(uVelocity, vUv - vec2(0.0, texelSize.y)).y;
            float div = 0.5 * (R - L + T - B);
            gl_FragColor = vec4(div, 0.0, 0.0, 1.0);
        }
    `;

    const pressureShader = `
        precision highp float;
        varying vec2 vUv;
        uniform sampler2D uPressure;
        uniform sampler2D uDivergence;
        uniform vec2 texelSize;
        
        void main() {
            float L = texture2D(uPressure, vUv - vec2(texelSize.x, 0.0)).x;
            float R = texture2D(uPressure, vUv + vec2(texelSize.x, 0.0)).x;
            float T = texture2D(uPressure, vUv + vec2(0.0, texelSize.y)).x;
            float B = texture2D(uPressure, vUv - vec2(0.0, texelSize.y)).x;
            float divergence = texture2D(uDivergence, vUv).x;
            float pressure = (L + R + B + T - divergence) * 0.25;
            gl_FragColor = vec4(pressure, 0.0, 0.0, 1.0);
        }
    `;

    const gradientSubtractShader = `
        precision highp float;
        varying vec2 vUv;
        uniform sampler2D uPressure;
        uniform sampler2D uVelocity;
        uniform vec2 texelSize;
        
        void main() {
            float L = texture2D(uPressure, vUv - vec2(texelSize.x, 0.0)).x;
            float R = texture2D(uPressure, vUv + vec2(texelSize.x, 0.0)).x;
            float T = texture2D(uPressure, vUv + vec2(0.0, texelSize.y)).x;
            float B = texture2D(uPressure, vUv - vec2(0.0, texelSize.y)).x;
            vec2 velocity = texture2D(uVelocity, vUv).xy;
            velocity -= vec2(R - L, T - B) * 0.5;
            gl_FragColor = vec4(velocity, 0.0, 1.0);
        }
    `;

    // Display shader - Premium Liquid Atmosphere
    // Very low density, soft additive glow, desaturated muted cyan
    const displayShader = `
        precision highp float;
        varying vec2 vUv;
        uniform sampler2D uTexture;
        uniform vec3 color;
        uniform vec3 edgeColor;
        
        // Desaturate function
        vec3 desaturate(vec3 c, float amount) {
            float gray = dot(c, vec3(0.299, 0.587, 0.114));
            return mix(c, vec3(gray), amount);
        }
        
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
            for (int i = 0; i < 4; i++) {
                v += a * noise(p);
                p *= 2.0;
                a *= 0.5;
            }
            return v;
        }
        
        void main() {
            vec4 c = texture2D(uTexture, vUv);
            float density = (c.r + c.g + c.b) * 0.333;
            
            // Sample neighbors for edge detection
            float L = texture2D(uTexture, vUv - vec2(0.01, 0.0)).x;
            float R = texture2D(uTexture, vUv + vec2(0.01, 0.0)).x;
            float T = texture2D(uTexture, vUv + vec2(0.0, 0.01)).x;
            float B = texture2D(uTexture, vUv - vec2(0.0, 0.01)).x;
            float neighborAvg = (L + R + T + B) * 0.25 * 0.333;
            
            // Low density - thin smoke layers
            density *= 0.2;
            
            // Add subtle texture
            float smoke = fbm(vUv * 2.0 + c.xy * 1.5) * 0.2 + 0.8;
            density *= smoke;
            
            // Edge blend for purple/blue shift
            float edge = smoothstep(0.1, 0.5, density);
            vec3 finalColor = mix(edgeColor, color, edge);
            
            // Desaturate for premium feel (30% desaturation)
            finalColor = desaturate(finalColor, 0.3);
            
            // Maximum glow
            float glow = exp(-density * 1.2) * 5.5;
            float waveGlow = density * 1.8;
            finalColor += color * (glow + waveGlow) * 5.5;
            
            // Front edges pitch black - where density is high but neighbors are lower (front of wave)
            float densityGradient = density - neighborAvg * 0.2;
            float isFrontEdge = smoothstep(0.02, 0.08, densityGradient) * smoothstep(0.15, 0.05, density);
            finalColor = mix(finalColor, vec3(0.0, 0.0, 0.0), isFrontEdge * 0.85);
            
            // Very low opacity - more dense but no fog (0.03 - 0.12 range)
            float alpha = density * 0.06;
            alpha = clamp(alpha, 0.0, 0.12);
            alpha += glow * 0.02;
            
            gl_FragColor = vec4(finalColor, alpha);
        }
    `;

    // ==================== WEBGL UTILS ====================

    function createShader(type, source) {
        const shader = gl.createShader(type);
        gl.shaderSource(shader, source);
        gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) return null;
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
        
        if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return null;
        return prog;
    }

    // ==================== FBO - Compatible Format ====================

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
            
            // Use RGBA with the detected type (half-float or unsigned byte)
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, type, null);
            
            this.fbo = gl.createFramebuffer();
            gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
            gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.texture, 0);
            
            const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
            if (status !== gl.FRAMEBUFFER_COMPLETE) {
                gl.bindFramebuffer(gl.FRAMEBUFFER, null);
                return;
            }
            
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
            const t = this.read;
            this.read = this.write;
            this.write = t;
        }
    }

    // Create FBOs with compatible format
    const velocity = new DoubleFBO(config.SIM_RESOLUTION, config.SIM_RESOLUTION, texType, filtering);
    const density = new DoubleFBO(config.DYE_RESOLUTION, config.DYE_RESOLUTION, texType, filtering);
    const pressure = new DoubleFBO(config.SIM_RESOLUTION, config.SIM_RESOLUTION, texType, gl.NEAREST);
    const divergence = new FBO(config.SIM_RESOLUTION, config.SIM_RESOLUTION, texType, gl.NEAREST);
    const curl = new FBO(config.SIM_RESOLUTION, config.SIM_RESOLUTION, texType, gl.NEAREST);

    // Create programs
    const advectionProgram = createProgram(baseVertexShader, advectionShader);
    const splatProgram = createProgram(baseVertexShader, splatShader);
    const curlProgram = createProgram(baseVertexShader, curlShader);
    const vorticityProgram = createProgram(baseVertexShader, vorticityShader);
    const divergenceProgram = createProgram(baseVertexShader, divergenceShader);
    const pressureProgram = createProgram(baseVertexShader, pressureShader);
    const gradientSubtractProgram = createProgram(baseVertexShader, gradientSubtractShader);
    const displayProgram = createProgram(baseVertexShader, displayShader);

    if (!advectionProgram || !displayProgram) return;

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
    displayUni.edgeColor = gl.getUniformLocation(displayProgram, 'edgeColor');

    // ==================== RENDER SETUP ====================

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
        const posLoc = gl.getAttribLocation(program, 'aPosition');
        gl.enableVertexAttribArray(posLoc);
        gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);
    }

    // ==================== SIMULATION ====================

    function splat(x, y, dx, dy, intensity = 1.0) {
        const colorScale = intensity * 1.5;
        
        gl.bindFramebuffer(gl.FRAMEBUFFER, density.write.fbo);
        gl.viewport(0, 0, density.write.width, density.write.height);
        bind(splatProgram);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, density.read.texture);
        gl.uniform1i(splatUni.uTarget, 0);
        gl.uniform1f(splatUni.aspectRatio, canvas.width / canvas.height);
        gl.uniform3f(splatUni.color, config.COLOR.r * colorScale, config.COLOR.g * colorScale, config.COLOR.b * colorScale);
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
    let trailPoints = [];

    window.addEventListener('mousemove', e => {
        if (!hasMoved) {
            lastX = e.clientX;
            lastY = e.clientY;
            hasMoved = true;
            return;
        }

        const currX = e.clientX;
        const currY = e.clientY;
        
        // Interpolate between last and current position for smooth trail
        const steps = 3;
        for (let i = 0; i < steps; i++) {
            const t = (i + 1) / steps;
            const x = (lastX + (currX - lastX) * t) / canvas.width;
            const y = 1.0 - (lastY + (currY - lastY) * t) / canvas.height;
            
            // Head is strongest, tail fades
            const intensity = 1.0 - (i / steps) * 0.6; // 1.0 at head, 0.4 at tail
            
            const dx = (currX - lastX) * config.SPLAT_FORCE / canvas.width * 0.5;
            const dy = -(currY - lastY) * config.SPLAT_FORCE / canvas.height * 0.5;
            
            if (Math.abs(dx) > 0.05 || Math.abs(dy) > 0.05) {
                splat(x, y, dx * intensity, dy * intensity, intensity);
            }
        }

        lastX = currX;
        lastY = currY;
    }, { passive: true });

    // ==================== RENDER LOOP ====================

    let lastTime = Date.now();
    let idleTime = 0;
    let hueShift = 0;

    function update() {
        const now = Date.now();
        const dt = Math.min((now - lastTime) / 1000, 0.016);
        lastTime = now;
        
        // Idle system - continuous subtle background motion
        if (config.IDLE_MOTION) {
            idleTime += dt;
            // Small random forces to keep fluid alive
            if (Math.random() < 0.05) {
                const idleX = 0.2 + Math.random() * 0.6;
                const idleY = 0.2 + Math.random() * 0.6;
                const idleForce = 200 + Math.random() * 300;
                splat(idleX, idleY, 
                    (Math.random() - 0.5) * idleForce / canvas.width,
                    (Math.random() - 0.5) * idleForce / canvas.height,
                    0.15 // Very subtle
                );
            }
        }
        
        // Dynamic HSV color shifting
        hueShift += config.COLOR_SHIFT_SPEED * dt;
        const shiftedColor = {
            r: config.COLOR.r + Math.sin(hueShift) * 0.02,
            g: config.COLOR.g + Math.cos(hueShift * 0.7) * 0.015,
            b: config.COLOR.b + Math.sin(hueShift * 1.3) * 0.025
        };

        step(dt);

        // Display - Premium liquid atmosphere
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.viewport(0, 0, canvas.width, canvas.height);
        // Standard blend for visibility with low density
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
        bind(displayProgram);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, density.read.texture);
        gl.uniform1i(displayUni.uTexture, 0);
        gl.uniform3f(displayUni.color, shiftedColor.r, shiftedColor.g, shiftedColor.b);
        gl.uniform3f(displayUni.edgeColor, config.EDGE_COLOR.r, config.EDGE_COLOR.g, config.EDGE_COLOR.b);
        gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);

        requestAnimationFrame(update);
    }

    update();
})();
