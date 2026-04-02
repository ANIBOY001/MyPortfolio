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
    initPageLoad();
    initProgressBars();
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
        title: 'E-commerce Platform',
        desc: 'Full shopping experience: product catalog, cart, checkout, and payments. Built for real businesses.',
        problem: 'Small businesses need robust e-commerce solutions without the complexity of enterprise platforms. Existing options were either too expensive or lacked essential features.',
        solution: 'Built a scalable e-commerce platform with complete shopping flow, payment integration, and admin dashboard for managing products and orders.',
        architecture: ['React/Next.js frontend with server-side rendering', 'Node.js + Express REST API with JWT auth', 'MongoDB for flexible product catalog storage', 'Stripe & PayPal payment integration', 'Admin dashboard for inventory and order management'],
        tech: ['React', 'Next.js', 'Node.js', 'Express', 'MongoDB', 'PostgreSQL', 'Stripe', 'PayPal']
    },
    2: {
        title: 'Portfolio CMS',
        desc: 'Advanced portfolio with blog system, dynamic project gallery, and integrated contact form. Production-ready UI.',
        problem: 'Developers need to showcase their work professionally while also sharing knowledge through blogs, without managing multiple platforms.',
        solution: 'Created a unified portfolio and blog platform with Markdown support, dynamic galleries, and seamless contact integration.',
        architecture: ['React/Next.js for fast, SEO-friendly pages', 'Node.js backend or serverless functions', 'Markdown processing for blog content', 'Dynamic project gallery with filtering', 'Email integration for contact forms'],
        tech: ['React', 'Next.js', 'Node.js', 'Markdown', 'Serverless', 'Email API']
    },
    3: {
        title: 'Blog & CMS Platform',
        desc: 'Users can create accounts, write posts, and comment. Full content management with admin panel.',
        problem: 'Content creators need a platform that combines user management, content creation, and community engagement in one system.',
        solution: 'Developed a full-featured CMS with authentication, rich text editing, commenting system, and comprehensive admin controls.',
        architecture: ['Node.js + Express RESTful API', 'MongoDB for document storage', 'React frontend with rich text editor', 'JWT-based user authentication', 'Admin panel for content moderation'],
        tech: ['Node.js', 'Express', 'MongoDB', 'React', 'JWT', 'Auth']
    },
    4: {
        title: 'Social Connect Platform',
        desc: 'Real-time social platform with posts, likes, comments, follows, and live messaging. Full user engagement system.',
        problem: 'Building real-time social features requires complex state management, authentication, and WebSocket connections that are hard to implement correctly.',
        solution: 'Created a complete social platform demonstrating real-time messaging, complex state management, and user engagement features.',
        architecture: ['React with Tailwind/Chakra UI frontend', 'Node.js + Express/NestJS backend', 'MongoDB/Firebase for data storage', 'Socket.io for real-time messaging', 'Firebase real-time DB for live updates'],
        tech: ['React', 'Tailwind CSS', 'Node.js', 'Socket.io', 'Firebase', 'MongoDB']
    }
};

function initProjectModal() {
    const modal = document.getElementById('project-modal');
    const modalBody = document.getElementById('modal-body');
    if (!modal || !modalBody) return;
    
    const closeBtn = modal.querySelector('.modal-close');
    const backdrop = modal.querySelector('.modal-backdrop');
    if (!closeBtn || !backdrop) return;
    
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

// Contact Form Handler - Copy to clipboard + open email
function initContactForm() {
    const form = document.getElementById('contact-form');
    const statusDiv = document.getElementById('form-status');
    if (!form) return;

    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        // Get form data
        const formData = new FormData(form);
        const name = formData.get('name');
        const email = formData.get('email');
        const subject = formData.get('subject');
        const message = formData.get('message');

        // Format email body
        const emailBody = `Name: ${name}
Email: ${email}

Message:
${message}`;

        try {
            // Copy to clipboard
            await navigator.clipboard.writeText(emailBody);

            // Show success message
            if (statusDiv) {
                statusDiv.textContent = 'Message copied to clipboard! Opening your email client...';
                statusDiv.className = 'form-status success visible';
            }

            // Open email client
            const mailtoLink = `mailto:Sheikhmohammad7878@gmail.com?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(emailBody)}`;
            window.location.href = mailtoLink;

            // Reset form after delay
            setTimeout(() => {
                form.reset();
                if (statusDiv) statusDiv.classList.remove('visible');
            }, 5000);

        } catch (err) {
            // Fallback: just open email client
            const mailtoLink = `mailto:Sheikhmohammad7878@gmail.com?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(emailBody)}`;
            window.location.href = mailtoLink;

            if (statusDiv) {
                statusDiv.textContent = 'Opening your email client...';
                statusDiv.className = 'form-status success visible';
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
