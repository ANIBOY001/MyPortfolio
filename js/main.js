// Portfolio Interactivity
document.addEventListener('DOMContentLoaded', () => {
    initThemeToggle();
    initCursorGlow();
    initScrollReveal();
    initAnimatedStats();
    initProjectModal();
    initContactForm();
    initSmoothScroll();
});

// Theme Toggle
function initThemeToggle() {
    const toggle = document.querySelector('.theme-toggle');
    const html = document.documentElement;
    
    // Check saved preference
    const savedTheme = localStorage.getItem('theme') || 'dark';
    html.setAttribute('data-theme', savedTheme);
    
    toggle.addEventListener('click', () => {
        const current = html.getAttribute('data-theme');
        const next = current === 'dark' ? 'light' : 'dark';
        html.setAttribute('data-theme', next);
        localStorage.setItem('theme', next);
    });
}

// Cursor Glow Effect
function initCursorGlow() {
    const cursor = document.querySelector('.cursor-glow');
    if (!cursor || window.matchMedia('(pointer: coarse)').matches) return;
    
    let mouseX = 0, mouseY = 0;
    let currentX = 0, currentY = 0;
    let rafId = null;
    let isActive = false;
    let inactivityTimeout = null;
    
    document.addEventListener('mousemove', (e) => {
        mouseX = e.clientX;
        mouseY = e.clientY;
        
        if (!isActive) {
            isActive = true;
            animate();
        }
        
        clearTimeout(inactivityTimeout);
        inactivityTimeout = setTimeout(() => {
            isActive = false;
            cancelAnimationFrame(rafId);
        }, 100);
    }, { passive: true });
    
    function animate() {
        if (!isActive) return;
        
        currentX += (mouseX - currentX) * 0.1;
        currentY += (mouseY - currentY) * 0.1;
        
        cursor.style.left = currentX + 'px';
        cursor.style.top = currentY + 'px';
        
        rafId = requestAnimationFrame(animate);
    }
}

// Scroll Reveal Animation
function initScrollReveal() {
    const reveals = document.querySelectorAll('.project-card, .skill-category, .timeline-item, .about-content, .about-visual');
    
    reveals.forEach(el => el.classList.add('reveal'));
    
    const observer = new IntersectionObserver((entries) => {
        entries.forEach((entry, index) => {
            if (entry.isIntersecting) {
                setTimeout(() => {
                    entry.target.classList.add('active');
                }, index * 100);
                observer.unobserve(entry.target);
            }
        });
    }, { threshold: 0.1, rootMargin: '0px 0px -50px 0px' });
    
    reveals.forEach(el => observer.observe(el));
}

// Animated Stats Counter
function initAnimatedStats() {
    const stats = document.querySelectorAll('.stat-number');
    
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const target = parseInt(entry.target.dataset.target);
                animateValue(entry.target, 0, target, 2000);
                observer.unobserve(entry.target);
            }
        });
    }, { threshold: 0.5 });
    
    stats.forEach(stat => observer.observe(stat));
}

function animateValue(element, start, end, duration) {
    const startTime = performance.now();
    
    function update(currentTime) {
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / duration, 1);
        
        // Easing function (easeOutQuart)
        const ease = 1 - Math.pow(1 - progress, 4);
        const current = Math.floor(start + (end - start) * ease);
        
        element.textContent = current + (end > 100 ? '+' : '');
        
        if (progress < 1) {
            requestAnimationFrame(update);
        }
    }
    
    requestAnimationFrame(update);
}

// Project Modal
const projectData = {
    1: {
        title: 'CloudSync Platform',
        desc: 'Real-time data synchronization platform handling 10M+ daily transactions',
        problem: 'Companies struggled with data consistency across distributed systems, leading to sync conflicts and data loss.',
        solution: 'Built an event-driven architecture with conflict-free replicated data types (CRDTs) for automatic conflict resolution.',
        architecture: ['React frontend with virtualized lists', 'Node.js microservices with Redis pub/sub', 'PostgreSQL with logical replication', 'WebSocket connections for real-time updates'],
        tech: ['React', 'Node.js', 'PostgreSQL', 'Redis', 'Docker', 'Kubernetes']
    },
    2: {
        title: 'AI Dashboard',
        desc: 'ML-powered analytics dashboard with predictive insights',
        problem: 'Business teams lacked actionable insights from their data, relying on manual analysis that took days.',
        solution: 'Created an AI-powered dashboard that automatically analyzes trends and predicts future metrics with 94% accuracy.',
        architecture: ['Next.js with server-side rendering', 'Python FastAPI with TensorFlow', 'Real-time data pipeline with Apache Kafka', 'Interactive D3.js visualizations'],
        tech: ['Next.js', 'Python', 'TensorFlow', 'AWS', 'Kafka', 'D3.js']
    },
    3: {
        title: 'E-Commerce API',
        desc: 'Headless commerce API serving 500K+ requests daily',
        problem: 'Legacy monolithic commerce platform was slow, expensive, and inflexible for modern frontend experiences.',
        solution: 'Developed a high-performance headless API with sub-50ms response times and flexible data models.',
        architecture: ['Go microservices for core API', 'GraphQL federation layer', 'MongoDB for product catalog', 'Elasticsearch for search', 'CDN edge caching'],
        tech: ['Go', 'GraphQL', 'MongoDB', 'Elasticsearch', 'Docker', 'Redis']
    }
};

function initProjectModal() {
    const modal = document.getElementById('project-modal');
    const modalBody = document.getElementById('modal-body');
    const closeBtn = modal.querySelector('.modal-close');
    const backdrop = modal.querySelector('.modal-backdrop');
    
    document.querySelectorAll('.project-details-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const card = btn.closest('.project-card');
            const id = card.dataset.project;
            const project = projectData[id];
            
            if (project) {
                modalBody.innerHTML = `
                    <h2 class="modal-title">${project.title}</h2>
                    <p class="modal-subtitle">${project.desc}</p>
                    
                    <div class="modal-section">
                        <h3>Problem</h3>
                        <p>${project.problem}</p>
                    </div>
                    
                    <div class="modal-section">
                        <h3>Solution</h3>
                        <p>${project.solution}</p>
                    </div>
                    
                    <div class="modal-section">
                        <h3>Architecture</h3>
                        <ul>${project.architecture.map(a => `<li>${a}</li>`).join('')}</ul>
                    </div>
                    
                    <div class="modal-tech">
                        ${project.tech.map(t => `<span class="tech-tag">${t}</span>`).join('')}
                    </div>
                `;
                
                modal.classList.add('active');
                document.body.style.overflow = 'hidden';
            }
        });
    });
    
    function closeModal() {
        modal.classList.remove('active');
        document.body.style.overflow = '';
    }
    
    closeBtn.addEventListener('click', closeModal);
    backdrop.addEventListener('click', closeModal);
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closeModal();
    });
}

// Contact Form
function initContactForm() {
    const form = document.getElementById('contact-form');
    
    form.addEventListener('submit', (e) => {
        e.preventDefault();
        
        const btn = form.querySelector('button[type="submit"]');
        const originalText = btn.textContent;
        
        btn.textContent = 'Sending...';
        btn.disabled = true;
        
        // Simulate form submission
        setTimeout(() => {
            btn.textContent = 'Message Sent!';
            btn.style.background = '#22c55e';
            form.reset();
            
            setTimeout(() => {
                btn.textContent = originalText;
                btn.style.background = '';
                btn.disabled = false;
            }, 3000);
        }, 1500);
    });
}

// Smooth Scroll
function initSmoothScroll() {
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function(e) {
            e.preventDefault();
            const target = document.querySelector(this.getAttribute('href'));
            if (target) {
                const headerOffset = 80;
                const elementPosition = target.getBoundingClientRect().top;
                const offsetPosition = elementPosition + window.pageYOffset - headerOffset;
                
                window.scrollTo({
                    top: offsetPosition,
                    behavior: 'smooth'
                });
            }
        });
    });
}

// Nav background on scroll
window.addEventListener('scroll', () => {
    const nav = document.querySelector('.nav');
    if (window.scrollY > 50) {
        nav.style.background = 'rgba(10, 10, 15, 0.95)';
    } else {
        nav.style.background = 'rgba(10, 10, 15, 0.8)';
    }
}, { passive: true });
