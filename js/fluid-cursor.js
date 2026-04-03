'use strict';

(function() {
    'use strict';

    // Check for touch device
    if (window.matchMedia('(pointer: coarse)').matches) return;

    const canvas = document.getElementById('fluid-cursor');
    if (!canvas) return;

    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    const gl = canvas.getContext('webgl', { alpha: true, antialias: false });
    if (!gl) return;

    // Vertex shader
    const vertexShader = gl.createShader(gl.VERTEX_SHADER);
    gl.shaderSource(vertexShader, `n        attribute vec2 position;
        void main() {
            gl_Position = vec4(position, 0.0, 1.0);
        }
    );
    gl.compileShader(vertexShader);

    // Fragment shader - ripple effect
    const fragmentShader = gl.createShader(gl.FRAGMENT_SHADER);
    gl.shaderSource(fragmentShader, `n        precision mediump float;
        uniform vec2 resolution;
        uniform vec2 mouse;
        uniform float time;
        
        void main() {
            vec2 uv = gl_FragCoord.xy / resolution;
            vec2 m = mouse / resolution;
            
            float dist = distance(uv, m);
            float ripple = sin(dist * 30.0 - time * 3.0) * 0.5 + 0.5;
            ripple *= exp(-dist * 5.0);
            
            float gray = ripple * 0.15;
            gl_FragColor = vec4(vec3(gray), gray * 0.5);
        }
    );
    gl.compileShader(fragmentShader);

    const program = gl.createProgram();
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);
    gl.useProgram(program);

    // Create quad
    const positions = new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]);
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);

    const positionLoc = gl.getAttribLocation(program, 'position');
    gl.enableVertexAttribArray(positionLoc);
    gl.vertexAttribPointer(positionLoc, 2, gl.FLOAT, false, 0, 0);

    // Uniforms
    const resolutionLoc = gl.getUniformLocation(program, 'resolution');
    const mouseLoc = gl.getUniformLocation(program, 'mouse');
    const timeLoc = gl.getUniformLocation(program, 'time');

    let mouseX = 0, mouseY = 0;
    let targetX = 0, targetY = 0;

    document.addEventListener('mousemove', (e) => {
        targetX = e.clientX;
        targetY = canvas.height - e.clientY;
    }, { passive: true });

    let startTime = Date.now();

    function render() {
        mouseX += (targetX - mouseX) * 0.1;
        mouseY += (targetY - mouseY) * 0.1;

        gl.viewport(0, 0, canvas.width, canvas.height);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

        gl.uniform2f(resolutionLoc, canvas.width, canvas.height);
        gl.uniform2f(mouseLoc, mouseX, mouseY);
        gl.uniform1f(timeLoc, (Date.now() - startTime) / 1000);

        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

        requestAnimationFrame(render);
    }

    render();

    window.addEventListener('resize', () => {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
    }, { passive: true });
})();
