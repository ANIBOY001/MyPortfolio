// Portfolio Interactivity
document.addEventListener('DOMContentLoaded', () => {
    initThemeToggle();
    initCursorGlow();
    initScrollReveal();
    initAnimatedStats();
    initProjectModal();
    initContactForm();
    initSmoothScroll();
    initTypewriter();
    initParallax();
    initFloatingElements();
    initMagneticHover();
    initPageLoad();
    initProgressBars();
    initGlitchEffect();
    init3DTilt();
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

// Contact Form with Formspree
function initContactForm() {
    const form = document.getElementById('contact-form');
    if (!form) return;

    const btn = form.querySelector('button[type="submit"]');
    const statusDiv = document.getElementById('form-status');
    const originalText = btn ? btn.textContent : 'Send Message';

    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        if (btn) {
            btn.disabled = true;
            btn.textContent = 'Sending...';
        }
        if (statusDiv) {
            statusDiv.className = 'form-status';
        }

        try {
            const response = await fetch(form.action, {
                method: 'POST',
                body: new FormData(form),
                headers: {
                    'Accept': 'application/json'
                }
            });

            if (response.ok) {
                if (statusDiv) {
                    statusDiv.textContent = 'Message sent successfully! I\'ll get back to you soon.';
                    statusDiv.className = 'form-status success visible';
                }
                form.reset();
            } else {
                throw new Error('Failed to send');
            }
        } catch (error) {
            if (statusDiv) {
                statusDiv.textContent = 'Failed to send. Please try again or email me directly.';
                statusDiv.className = 'form-status error visible';
            }
        } finally {
            if (btn) {
                btn.textContent = originalText;
                btn.disabled = false;
            }

            setTimeout(() => {
                if (statusDiv) statusDiv.classList.remove('visible');
            }, 5000);
        }
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
    if (!nav) return;
    
    if (window.scrollY > 50) {
        nav.classList.add('scrolled');
    } else {
        nav.classList.remove('scrolled');
    }
}, { passive: true });

// Typewriter Effect for Hero Title
function initTypewriter() {
    const title = document.querySelector('.hero-greeting');
    if (!title) return;
    
    const text = title.textContent;
    title.textContent = '';
    title.style.opacity = '1';
    
    let i = 0;
    function type() {
        if (i < text.length) {
            title.textContent += text.charAt(i);
            i++;
            setTimeout(type, 50 + Math.random() * 50);
        }
    }
    
    setTimeout(type, 500);
}

// Parallax Scroll Effect
function initParallax() {
    const ambient = document.querySelector('.ambient-bg');
    const heroGrid = document.querySelector('.hero-grid');
    
    if (!ambient && !heroGrid) return;
    
    let ticking = false;
    
    window.addEventListener('scroll', () => {
        if (!ticking) {
            requestAnimationFrame(() => {
                const scrolled = window.pageYOffset;
                
                if (ambient) {
                    ambient.style.transform = `translateY(${scrolled * 0.3}px)`;
                }
                if (heroGrid) {
                    heroGrid.style.transform = `translateY(${scrolled * 0.1}px)`;
                }
                
                ticking = false;
            });
            ticking = true;
        }
    }, { passive: true });
}

// Floating Animation for Elements
function initFloatingElements() {
    const icons = document.querySelectorAll('.service-icon, .step-icon');
    
    icons.forEach((icon, index) => {
        icon.style.animation = `float 3s ease-in-out ${index * 0.2}s infinite`;
    });
}

// Magnetic Hover Effect
function initMagneticHover() {
    const buttons = document.querySelectorAll('.btn, .project-card, .service-card, .blog-card');
    
    buttons.forEach(btn => {
        btn.addEventListener('mousemove', (e) => {
            const rect = btn.getBoundingClientRect();
            const x = e.clientX - rect.left - rect.width / 2;
            const y = e.clientY - rect.top - rect.height / 2;
            
            btn.style.transform = `translate(${x * 0.1}px, ${y * 0.1}px)`;
        });
        
        btn.addEventListener('mouseleave', () => {
            btn.style.transform = '';
        });
    });
}

// Page Load Animation
function initPageLoad() {
    const elements = document.querySelectorAll('.hero-title, .hero-subtitle, .hero-cta, .hero-stats');
    
    elements.forEach((el, index) => {
        el.style.opacity = '0';
        el.style.transform = 'translateY(30px)';
        
        setTimeout(() => {
            el.style.transition = 'all 0.8s cubic-bezier(0.16, 1, 0.3, 1)';
            el.style.opacity = '1';
            el.style.transform = 'translateY(0)';
        }, 300 + index * 150);
    });
}

// Progress Bars Animation
function initProgressBars() {
    const skillsSection = document.querySelector('.skills');
    if (!skillsSection) return;
    
    const progressBars = [
        { name: 'Frontend Development', level: 95 },
        { name: 'Backend Systems', level: 90 },
        { name: 'DevOps & Cloud', level: 85 },
        { name: 'Database Design', level: 88 }
    ];
    
    // Create progress bars HTML
    const container = document.createElement('div');
    container.className = 'skills-progress';
    container.innerHTML = progressBars.map(skill => `
        <div class="progress-item">
            <div class="progress-header">
                <span class="progress-name">${skill.name}</span>
                <span class="progress-value">${skill.level}%</span>
            </div>
            <div class="progress-bar">
                <div class="progress-fill" data-level="${skill.level}"></div>
            </div>
        </div>
    `).join('');
    
    skillsSection.querySelector('.container').appendChild(container);
    
    // Animate on scroll
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const fills = entry.target.querySelectorAll('.progress-fill');
                fills.forEach((fill, index) => {
                    setTimeout(() => {
                        fill.style.width = fill.dataset.level + '%';
                    }, index * 100);
                });
                observer.unobserve(entry.target);
            }
        });
    }, { threshold: 0.3 });
    
    observer.observe(container);
}

// Glitch Text Effect
function initGlitchEffect() {
    const brand = document.querySelector('.nav-brand');
    if (!brand) return;
    
    const originalText = brand.textContent;
    const chars = '!@#$%^&*()_+-=[]{}|;:,.<>?';
    
    brand.addEventListener('mouseenter', () => {
        let iterations = 0;
        const interval = setInterval(() => {
            brand.textContent = originalText
                .split('')
                .map((char, index) => {
                    if (index < iterations) {
                        return originalText[index];
                    }
                    return chars[Math.floor(Math.random() * chars.length)];
                })
                .join('');
            
            if (iterations >= originalText.length) {
                clearInterval(interval);
            }
            iterations += 1/3;
        }, 30);
    });
    
    brand.addEventListener('mouseleave', () => {
        brand.textContent = originalText;
    });
}

// Enhanced Scroll Reveal with Stagger
function initScrollReveal() {
    const reveals = document.querySelectorAll('.project-card, .skill-category, .timeline-item, .about-content, .about-visual, .service-card, .testimonial-card, .blog-card, .process-step');
    
    reveals.forEach(el => el.classList.add('reveal'));
    
    const observer = new IntersectionObserver((entries) => {
        entries.forEach((entry, index) => {
            if (entry.isIntersecting) {
                setTimeout(() => {
                    entry.target.classList.add('active');
                    entry.target.style.transition = 'all 0.8s cubic-bezier(0.16, 1, 0.3, 1)';
                }, index * 80);
                observer.unobserve(entry.target);
            }
        });
    }, { threshold: 0.1, rootMargin: '0px 0px -50px 0px' });
    
    reveals.forEach(el => observer.observe(el));
}

// 3D Tilt Effect for Cards
function init3DTilt() {
    const cards = document.querySelectorAll('.project-card, .service-card');
    
    cards.forEach(card => {
        card.addEventListener('mousemove', (e) => {
            const rect = card.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            
            const centerX = rect.width / 2;
            const centerY = rect.height / 2;
            
            const rotateX = (y - centerY) / 20;
            const rotateY = (centerX - x) / 20;
            
            card.style.transform = `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale3d(1.02, 1.02, 1.02)`;
        });
        
        card.addEventListener('mouseleave', () => {
            card.style.transform = 'perspective(1000px) rotateX(0) rotateY(0) scale3d(1, 1, 1)';
        });
    });
}
