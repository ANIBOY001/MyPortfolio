// Smoke Cursor Effect - Simpler but smooth
(function() {
    // Skip on touch devices
    if (window.matchMedia('(pointer: coarse)').matches) return;
    
    const canvas = document.getElementById('fluid-cursor');
    if (!canvas) {
        console.error('Smoke cursor canvas not found!');
        return;
    }
    
    const ctx = canvas.getContext('2d');
    if (!ctx) {
        console.error('Canvas 2D context not supported!');
        return;
    }
    
    console.log('Smoke cursor initializing...');
    
    // Configuration
    const config = {
        fadeRate: 0.08,
        growthRate: 0.3,
        spawnRate: 3,
        color: { r: 166, g: 167, b: 162 }
    };
    
    // Resize canvas
    function resize() {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
    }
    resize();
    window.addEventListener('resize', resize, { passive: true });
    
    // Particle class
    class SmokeParticle {
        constructor(x, y, vx, vy) {
            this.x = x;
            this.y = y;
            this.vx = vx * 0.5;
            this.vy = vy * 0.5 - 0.3;
            this.size = Math.random() * 8 + 4;
            this.maxSize = Math.random() * 25 + 35;
            this.life = 1.0;
            this.decay = Math.random() * 0.008 + 0.006;
            this.growth = Math.random() * 0.15 + 0.08;
        }
        
        update() {
            this.x += this.vx;
            this.y += this.vy;
            this.vx *= 0.98;
            this.vy *= 0.98;
            this.size += this.growth;
            this.life -= this.decay;
            
            this.x += (Math.random() - 0.5) * 0.3;
            this.y += (Math.random() - 0.5) * 0.3 - 0.15;
            
            return this.life > 0;
        }
        
        draw(ctx) {
            const alpha = this.life * 0.5;
            const gradient = ctx.createRadialGradient(
                this.x, this.y, 0,
                this.x, this.y, this.size
            );
            
            gradient.addColorStop(0, `rgba(${config.color.r}, ${config.color.g}, ${config.color.b}, ${alpha})`);
            gradient.addColorStop(0.5, `rgba(${config.color.r}, ${config.color.g}, ${config.color.b}, ${alpha * 0.4})`);
            gradient.addColorStop(1, `rgba(${config.color.r}, ${config.color.g}, ${config.color.b}, 0)`);
            
            ctx.fillStyle = gradient;
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
            ctx.fill();
        }
    }
    
    // Particle system
    const particles = [];
    let lastX = 0;
    let lastY = 0;
    let hasMoved = false;
    
    window.addEventListener('mousemove', (e) => {
        if (!hasMoved) {
            lastX = e.clientX;
            lastY = e.clientY;
            hasMoved = true;
            return;
        }
        
        const dx = e.clientX - lastX;
        const dy = e.clientY - lastY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        
        if (dist > 2) {
            const count = Math.min(Math.floor(dist / 4), config.spawnRate);
            for (let i = 0; i < count; i++) {
                const t = i / count;
                const x = lastX + dx * t;
                const y = lastY + dy * t;
                particles.push(new SmokeParticle(
                    x + (Math.random() - 0.5) * 8,
                    y + (Math.random() - 0.5) * 8,
                    dx * 0.08 + (Math.random() - 0.5) * 0.5,
                    dy * 0.08 + (Math.random() - 0.5) * 0.5
                ));
            }
            
            lastX = e.clientX;
            lastY = e.clientY;
        }
    }, { passive: true });
    
    // Animation loop
    function animate() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        ctx.globalCompositeOperation = 'screen';
        
        for (let i = particles.length - 1; i >= 0; i--) {
            if (!particles[i].update()) {
                particles.splice(i, 1);
            } else {
                particles[i].draw(ctx);
            }
        }
        
        ctx.globalCompositeOperation = 'source-over';
        
        requestAnimationFrame(animate);
    }
    
    console.log('Starting smoke cursor');
    animate();
})();
