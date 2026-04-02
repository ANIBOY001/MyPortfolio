// WebGL Fluid Cursor - Smooth Butter-like Fluid Simulation
(function() {
    // Skip on touch devices
    if (window.matchMedia('(pointer: coarse)').matches) return;
    
    const canvas = document.getElementById('fluid-cursor');
    if (!canvas) return;
    
    const gl = canvas.getContext('webgl', {
        alpha: true,
        antialias: false,
        preserveDrawingBuffer: false
    }) || canvas.getContext('experimental-webgl');
    
    if (!gl) {
        console.log('WebGL not supported, falling back to CSS cursor');
        return;
    }
    
    // Configuration
    const config = {
        textureSize: 256, // Fluid simulation resolution
        density: 0.5,
        viscosity: 0.002,
        pressure: 0.8,
        curl: 30,
        dissipation: 0.985,
        radius: 0.04,
        color: { r: 0.65, g: 0.65, b: 0.64 } // Accent color #A6A7A2
    };
    
    // Resize canvas
    function resize() {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
        gl.viewport(0, 0, canvas.width, canvas.height);
    }
    resize();
    window.addEventListener('resize', resize, { passive: true });
    
    // Shader sources
    const vertexShaderSource = `
        attribute vec2 a_position;
        void main() {
            gl_Position = vec4(a_position, 0.0, 1.0);
        }
    `;
    
    const copyFragmentShader = `
        precision mediump float;
        uniform sampler2D u_texture;
        uniform vec2 u_resolution;
        void main() {
            vec2 uv = gl_FragCoord.xy / u_resolution;
            gl_FragColor = texture2D(u_texture, uv);
        }
    `;
    
    const clearFragmentShader = `
        precision mediump float;
        uniform sampler2D u_texture;
        uniform float u_value;
        uniform vec2 u_resolution;
        void main() {
            vec2 uv = gl_FragCoord.xy / u_resolution;
            vec4 color = texture2D(u_texture, uv);
            gl_FragColor = color * u_value;
        }
    `;
    
    const advectionFragmentShader = `
        precision mediump float;
        uniform sampler2D u_velocity;
        uniform sampler2D u_source;
        uniform vec2 u_resolution;
        uniform vec2 u_texelSize;
        uniform float u_dt;
        uniform float u_dissipation;
        
        void main() {
            vec2 uv = gl_FragCoord.xy / u_resolution;
            vec2 coord = uv - u_dt * texture2D(u_velocity, uv).xy * u_texelSize;
            gl_FragColor = u_dissipation * texture2D(u_source, coord);
        }
    `;
    
    const divergenceFragmentShader = `
        precision mediump float;
        uniform sampler2D u_velocity;
        uniform vec2 u_resolution;
        uniform vec2 u_texelSize;
        
        void main() {
            vec2 uv = gl_FragCoord.xy / u_resolution;
            
            float x0 = texture2D(u_velocity, uv - vec2(u_texelSize.x, 0.0)).x;
            float x1 = texture2D(u_velocity, uv + vec2(u_texelSize.x, 0.0)).x;
            float y0 = texture2D(u_velocity, uv - vec2(0.0, u_texelSize.y)).y;
            float y1 = texture2D(u_velocity, uv + vec2(0.0, u_texelSize.y)).y;
            
            float div = (x1 - x0 + y1 - y0) * 0.5;
            gl_FragColor = vec4(div, 0.0, 0.0, 1.0);
        }
    `;
    
    const curlFragmentShader = `
        precision mediump float;
        uniform sampler2D u_velocity;
        uniform vec2 u_resolution;
        uniform vec2 u_texelSize;
        
        void main() {
            vec2 uv = gl_FragCoord.xy / u_resolution;
            
            float x0 = texture2D(u_velocity, uv - vec2(u_texelSize.x, 0.0)).y;
            float x1 = texture2D(u_velocity, uv + vec2(u_texelSize.x, 0.0)).y;
            float y0 = texture2D(u_velocity, uv - vec2(0.0, u_texelSize.y)).x;
            float y1 = texture2D(u_velocity, uv + vec2(0.0, u_texelSize.y)).x;
            
            float curl = (x1 - x0 - y1 + y0) * 0.5;
            gl_FragColor = vec4(curl, 0.0, 0.0, 1.0);
        }
    `;
    
    const vorticityFragmentShader = `
        precision mediump float;
        uniform sampler2D u_velocity;
        uniform sampler2D u_curl;
        uniform vec2 u_resolution;
        uniform vec2 u_texelSize;
        uniform float u_curlStrength;
        
        void main() {
            vec2 uv = gl_FragCoord.xy / u_resolution;
            
            float c = texture2D(u_curl, uv).x;
            vec2 force = vec2(abs(c) - abs(texture2D(u_curl, uv + vec2(0.0, u_texelSize.y)).x),
                             abs(texture2D(u_curl, uv + vec2(u_texelSize.x, 0.0)).x) - abs(c));
            force *= u_curlStrength * c / length(force + 0.00001);
            
            vec2 vel = texture2D(u_velocity, uv).xy;
            gl_FragColor = vec4(vel + force * u_texelSize, 0.0, 1.0);
        }
    `;
    
    const pressureFragmentShader = `
        precision mediump float;
        uniform sampler2D u_pressure;
        uniform sampler2D u_divergence;
        uniform vec2 u_resolution;
        uniform vec2 u_texelSize;
        
        void main() {
            vec2 uv = gl_FragCoord.xy / u_resolution;
            
            float x0 = texture2D(u_pressure, uv - vec2(u_texelSize.x, 0.0)).x;
            float x1 = texture2D(u_pressure, uv + vec2(u_texelSize.x, 0.0)).x;
            float y0 = texture2D(u_pressure, uv - vec2(0.0, u_texelSize.y)).x;
            float y1 = texture2D(u_pressure, uv + vec2(0.0, u_texelSize.y)).x;
            float div = texture2D(u_divergence, uv).x;
            
            float pressure = (x0 + x1 + y0 + y1 - div) * 0.25;
            gl_FragColor = vec4(pressure, 0.0, 0.0, 1.0);
        }
    `;
    
    const gradientSubtractFragmentShader = `
        precision mediump float;
        uniform sampler2D u_pressure;
        uniform sampler2D u_velocity;
        uniform vec2 u_resolution;
        uniform vec2 u_texelSize;
        
        void main() {
            vec2 uv = gl_FragCoord.xy / u_resolution;
            
            float x0 = texture2D(u_pressure, uv - vec2(u_texelSize.x, 0.0)).x;
            float x1 = texture2D(u_pressure, uv + vec2(u_texelSize.x, 0.0)).x;
            float y0 = texture2D(u_pressure, uv - vec2(0.0, u_texelSize.y)).x;
            float y1 = texture2D(u_pressure, uv + vec2(0.0, u_texelSize.y)).x;
            
            vec2 vel = texture2D(u_velocity, uv).xy;
            vel -= vec2(x1 - x0, y1 - y0) * 0.5;
            gl_FragColor = vec4(vel, 0.0, 1.0);
        }
    `;
    
    const splatFragmentShader = `
        precision mediump float;
        uniform sampler2D u_target;
        uniform vec2 u_resolution;
        uniform vec2 u_point;
        uniform vec3 u_color;
        uniform float u_radius;
        
        void main() {
            vec2 uv = gl_FragCoord.xy / u_resolution;
            vec2 p = u_point - uv;
            p.x *= u_resolution.x / u_resolution.y;
            float d = length(p);
            float strength = exp(-d / u_radius) * 0.5;
            vec4 base = texture2D(u_target, uv);
            gl_FragColor = base + vec4(u_color * strength, strength);
        }
    `;
    
    const displayFragmentShader = `
        precision mediump float;
        uniform sampler2D u_texture;
        uniform vec2 u_resolution;
        uniform vec3 u_color;
        
        void main() {
            vec2 uv = gl_FragCoord.xy / u_resolution;
            vec4 color = texture2D(u_texture, uv);
            
            // Mix with accent color
            vec3 finalColor = mix(vec3(0.0), u_color, min(color.x * 3.0, 1.0));
            
            // Add glow
            float glow = smoothstep(0.0, 0.5, color.x);
            finalColor += u_color * glow * 0.3;
            
            gl_FragColor = vec4(finalColor, color.a * 0.9);
        }
    `;
    
    // Compile shader
    function compileShader(source, type) {
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
    
    // Create program
    function createProgram(vertexSource, fragmentSource) {
        const vertexShader = compileShader(vertexSource, gl.VERTEX_SHADER);
        const fragmentShader = compileShader(fragmentSource, gl.FRAGMENT_SHADER);
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
    
    // Create programs
    const copyProgram = createProgram(vertexShaderSource, copyFragmentShader);
    const clearProgram = createProgram(vertexShaderSource, clearFragmentShader);
    const advectionProgram = createProgram(vertexShaderSource, advectionFragmentShader);
    const divergenceProgram = createProgram(vertexShaderSource, divergenceFragmentShader);
    const curlProgram = createProgram(vertexShaderSource, curlFragmentShader);
    const vorticityProgram = createProgram(vertexShaderSource, vorticityFragmentShader);
    const pressureProgram = createProgram(vertexShaderSource, pressureFragmentShader);
    const gradientSubtractProgram = createProgram(vertexShaderSource, gradientSubtractFragmentShader);
    const splatProgram = createProgram(vertexShaderSource, splatFragmentShader);
    const displayProgram = createProgram(vertexShaderSource, displayFragmentShader);
    
    if (!copyProgram || !advectionProgram || !displayProgram) {
        console.error('Failed to create shader programs');
        return;
    }
    
    // Create full-screen quad
    const positions = new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]);
    const quadBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);
    
    // Framebuffer management
    function createFBO(width, height) {
        const texture = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        
        const fbo = gl.createFramebuffer();
        gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
        
        return { texture, fbo, width, height };
    }
    
    function createDoubleFBO(width, height) {
        return {
            read: createFBO(width, height),
            write: createFBO(width, height),
            swap: function() {
                const temp = this.read;
                this.read = this.write;
                this.write = temp;
            }
        };
    }
    
    // Create FBOs
    const simWidth = config.textureSize;
    const simHeight = Math.floor(config.textureSize * canvas.height / canvas.width);
    
    const velocityFBO = createDoubleFBO(simWidth, simHeight);
    const densityFBO = createDoubleFBO(simWidth, simHeight);
    const pressureFBO = createDoubleFBO(simWidth, simHeight);
    const divergenceFBO = createFBO(simWidth, simHeight);
    const curlFBO = createFBO(simWidth, simHeight);
    
    // Uniform locations cache
    function getUniforms(program) {
        const uniforms = {};
        const numUniforms = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS);
        for (let i = 0; i < numUniforms; i++) {
            const info = gl.getActiveUniform(program, i);
            uniforms[info.name] = gl.getUniformLocation(program, info.name);
        }
        return uniforms;
    }
    
    const copyUniforms = getUniforms(copyProgram);
    const clearUniforms = getUniforms(clearProgram);
    const advectionUniforms = getUniforms(advectionProgram);
    const divergenceUniforms = getUniforms(divergenceProgram);
    const curlUniforms = getUniforms(curlProgram);
    const vorticityUniforms = getUniforms(vorticityProgram);
    const pressureUniforms = getUniforms(pressureProgram);
    const gradientSubtractUniforms = getUniforms(gradientSubtractProgram);
    const splatUniforms = getUniforms(splatProgram);
    const displayUniforms = getUniforms(displayProgram);
    
    // Bind quad
    function bindQuad(program) {
        const positionLocation = gl.getAttribLocation(program, 'a_position');
        gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
        gl.enableVertexAttribArray(positionLocation);
        gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);
    }
    
    // Blit (render to target)
    function blit(target) {
        if (target) {
            gl.bindFramebuffer(gl.FRAMEBUFFER, target.fbo);
            gl.viewport(0, 0, target.width, target.height);
        } else {
            gl.bindFramebuffer(gl.FRAMEBUFFER, null);
            gl.viewport(0, 0, canvas.width, canvas.height);
        }
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }
    
    // Input tracking
    const inputs = [];
    let lastMouseX = 0;
    let lastMouseY = 0;
    
    function getSimCoords(clientX, clientY) {
        return {
            x: clientX / canvas.width,
            y: 1.0 - clientY / canvas.height
        };
    }
    
    canvas.addEventListener('mousemove', (e) => {
        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        
        const dx = x - lastMouseX;
        const dy = y - lastMouseY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        
        if (dist > 1) {
            const simPos = getSimCoords(x, y);
            const velocity = {
                x: dx * 2.5 / canvas.width,
                y: -dy * 2.5 / canvas.height
            };
            
            inputs.push({
                x: simPos.x,
                y: simPos.y,
                dx: velocity.x,
                dy: velocity.y,
                color: config.color
            });
        }
        
        lastMouseX = x;
        lastMouseY = y;
    }, { passive: true });
    
    // Splat function
    function splat(target, x, y, dx, dy, color) {
        gl.useProgram(splatProgram);
        bindQuad(splatProgram);
        
        gl.uniform1i(splatUniforms['u_target'], 0);
        gl.uniform2f(splatUniforms['u_resolution'], target.width, target.height);
        gl.uniform2f(splatUniforms['u_point'], x, y);
        gl.uniform3f(splatUniforms['u_color'], dx, dy, 0.0);
        gl.uniform1f(splatUniforms['u_radius'], config.radius);
        
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, target.read.texture);
        
        blit(target.write);
        target.swap();
    }
    
    // Simulation step
    function step() {
        // Process inputs
        for (let i = inputs.length - 1; i >= 0; i--) {
            const input = inputs[i];
            splat(velocityFBO, input.x, input.y, input.dx, input.dy, input.color);
            splat(densityFBO, input.x, input.y, input.dx, input.dy, input.color);
        }
        inputs.length = 0;
        
        // Curl
        gl.useProgram(curlProgram);
        bindQuad(curlProgram);
        gl.uniform1i(curlUniforms['u_velocity'], 0);
        gl.uniform2f(curlUniforms['u_resolution'], simWidth, simHeight);
        gl.uniform2f(curlUniforms['u_texelSize'], 1.0 / simWidth, 1.0 / simHeight);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, velocityFBO.read.texture);
        blit(curlFBO);
        
        // Vorticity
        gl.useProgram(vorticityProgram);
        bindQuad(vorticityProgram);
        gl.uniform1i(vorticityUniforms['u_velocity'], 0);
        gl.uniform1i(vorticityUniforms['u_curl'], 1);
        gl.uniform2f(vorticityUniforms['u_resolution'], simWidth, simHeight);
        gl.uniform2f(vorticityUniforms['u_texelSize'], 1.0 / simWidth, 1.0 / simHeight);
        gl.uniform1f(vorticityUniforms['u_curlStrength'], config.curl);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, velocityFBO.read.texture);
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, curlFBO.texture);
        blit(velocityFBO.write);
        velocityFBO.swap();
        
        // Divergence
        gl.useProgram(divergenceProgram);
        bindQuad(divergenceProgram);
        gl.uniform1i(divergenceUniforms['u_velocity'], 0);
        gl.uniform2f(divergenceUniforms['u_resolution'], simWidth, simHeight);
        gl.uniform2f(divergenceUniforms['u_texelSize'], 1.0 / simWidth, 1.0 / simHeight);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, velocityFBO.read.texture);
        blit(divergenceFBO);
        
        // Clear pressure
        gl.useProgram(clearProgram);
        bindQuad(clearProgram);
        gl.uniform1i(clearUniforms['u_texture'], 0);
        gl.uniform1f(clearUniforms['u_value'], config.pressure);
        gl.uniform2f(clearUniforms['u_resolution'], simWidth, simHeight);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, pressureFBO.read.texture);
        blit(pressureFBO.write);
        pressureFBO.swap();
        
        // Pressure solve (multiple iterations for stability)
        for (let i = 0; i < 20; i++) {
            gl.useProgram(pressureProgram);
            bindQuad(pressureProgram);
            gl.uniform1i(pressureUniforms['u_pressure'], 0);
            gl.uniform1i(pressureUniforms['u_divergence'], 1);
            gl.uniform2f(pressureUniforms['u_resolution'], simWidth, simHeight);
            gl.uniform2f(pressureUniforms['u_texelSize'], 1.0 / simWidth, 1.0 / simHeight);
            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, pressureFBO.read.texture);
            gl.activeTexture(gl.TEXTURE1);
            gl.bindTexture(gl.TEXTURE_2D, divergenceFBO.texture);
            blit(pressureFBO.write);
            pressureFBO.swap();
        }
        
        // Gradient subtract
        gl.useProgram(gradientSubtractProgram);
        bindQuad(gradientSubtractProgram);
        gl.uniform1i(gradientSubtractUniforms['u_pressure'], 0);
        gl.uniform1i(gradientSubtractUniforms['u_velocity'], 1);
        gl.uniform2f(gradientSubtractUniforms['u_resolution'], simWidth, simHeight);
        gl.uniform2f(gradientSubtractUniforms['u_texelSize'], 1.0 / simWidth, 1.0 / simHeight);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, pressureFBO.read.texture);
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, velocityFBO.read.texture);
        blit(velocityFBO.write);
        velocityFBO.swap();
        
        // Advect velocity
        gl.useProgram(advectionProgram);
        bindQuad(advectionProgram);
        gl.uniform1i(advectionUniforms['u_velocity'], 0);
        gl.uniform1i(advectionUniforms['u_source'], 1);
        gl.uniform2f(advectionUniforms['u_resolution'], simWidth, simHeight);
        gl.uniform2f(advectionUniforms['u_texelSize'], 1.0 / simWidth, 1.0 / simHeight);
        gl.uniform1f(advectionUniforms['u_dt'], 0.016);
        gl.uniform1f(advectionUniforms['u_dissipation'], 0.99);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, velocityFBO.read.texture);
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, velocityFBO.read.texture);
        blit(velocityFBO.write);
        velocityFBO.swap();
        
        // Advect density
        gl.useProgram(advectionProgram);
        bindQuad(advectionProgram);
        gl.uniform1i(advectionUniforms['u_velocity'], 0);
        gl.uniform1i(advectionUniforms['u_source'], 1);
        gl.uniform2f(advectionUniforms['u_resolution'], simWidth, simHeight);
        gl.uniform2f(advectionUniforms['u_texelSize'], 1.0 / simWidth, 1.0 / simHeight);
        gl.uniform1f(advectionUniforms['u_dt'], 0.016);
        gl.uniform1f(advectionUniforms['u_dissipation'], config.dissipation);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, velocityFBO.read.texture);
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, densityFBO.read.texture);
        blit(densityFBO.write);
        densityFBO.swap();
    }
    
    // Render
    function render() {
        step();
        
        // Display
        gl.useProgram(displayProgram);
        bindQuad(displayProgram);
        gl.uniform1i(displayUniforms['u_texture'], 0);
        gl.uniform2f(displayUniforms['u_resolution'], canvas.width, canvas.height);
        gl.uniform3f(displayUniforms['u_color'], config.color.r, config.color.g, config.color.b);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, densityFBO.read.texture);
        blit(null);
        
        requestAnimationFrame(render);
    }
    
    // Enable blending for smooth look
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    
    // Start
    render();
})();
