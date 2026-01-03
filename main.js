// SocialTush Main JavaScript
// Handles all interactive components, animations, and user interactions

document.addEventListener('DOMContentLoaded', function() {
    // Initialize all components
    initTypewriter();
    initScrollAnimations();
    initMobileMenu();
    initDashboard();
    initCounters();
    initCharts();
    initPlatformTabs();
});

// Typewriter Effect for Hero Section
function initTypewriter() {
    const typed = new Typed('#typed-text', {
        strings: [
            'Transform Your Social Media Into Revenue',
            'Data-Driven Marketing That Works',
            'Grow Your Business with Social Media'
        ],
        typeSpeed: 60,
        backSpeed: 40,
        backDelay: 2000,
        startDelay: 500,
        loop: true,
        showCursor: true,
        cursorChar: '|',
        autoInsertCss: true
    });
}

// Scroll Animations
function initScrollAnimations() {
    // Reveal animations on scroll
    const observerOptions = {
        threshold: 0.1,
        rootMargin: '0px 0px -50px 0px'
    };

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('active');
            }
        });
    }, observerOptions);

    // Observe all reveal elements
    document.querySelectorAll('.reveal').forEach(el => {
        observer.observe(el);
    });

    // Smooth scrolling for navigation links
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            e.preventDefault();
            const target = document.querySelector(this.getAttribute('href'));
            if (target) {
                target.scrollIntoView({
                    behavior: 'smooth',
                    block: 'start'
                });
            }
        });
    });
}

// Mobile Menu Toggle
function initMobileMenu() {
    const mobileMenuBtn = document.getElementById('mobile-menu-btn');
    const mobileMenu = document.getElementById('mobile-menu');

    if (mobileMenuBtn && mobileMenu) {
        mobileMenuBtn.addEventListener('click', () => {
            mobileMenu.classList.toggle('hidden');
        });
    }
}

// Dashboard Functionality
function initDashboard() {
    // Animate metrics on page load
    setTimeout(() => {
        animateMetric('followers-count', 15420);
        animateMetric('engagement-rate', 4.8);
        animateMetric('reach-count', 89250);
        animateMetric('roi-percentage', 285);
    }, 1000);
}

// Animate Individual Metric
function animateMetric(elementId, targetValue) {
    const element = document.getElementById(elementId);
    if (!element) return;

    const isPercentage = elementId.includes('rate') || elementId.includes('roi');
    const duration = 2000;
    const startTime = performance.now();

    function updateCounter(currentTime) {
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / duration, 1);
        
        // Easing function for smooth animation
        const easeOut = 1 - Math.pow(1 - progress, 3);
        const currentValue = targetValue * easeOut;

        if (isPercentage) {
            element.textContent = currentValue.toFixed(1) + '%';
        } else if (targetValue > 1000) {
            element.textContent = Math.floor(currentValue).toLocaleString();
        } else {
            element.textContent = Math.floor(currentValue);
        }

        if (progress < 1) {
            requestAnimationFrame(updateCounter);
        }
    }

    requestAnimationFrame(updateCounter);
}

// Statistics Counters
function initCounters() {
    const counters = [
        { id: 'clients-count', target: 150 },
        { id: 'campaigns-count', target: 480 },
        { id: 'roi-avg', target: 3.2 },
        { id: 'experience-years', target: 8 }
    ];

    // Trigger counters when they come into view
    const counterObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const counter = counters.find(c => c.id === entry.target.id);
                if (counter) {
                    animateCounter(counter.id, counter.target);
                    counterObserver.unobserve(entry.target);
                }
            }
        });
    }, { threshold: 0.5 });

    counters.forEach(counter => {
        const element = document.getElementById(counter.id);
        if (element) {
            counterObserver.observe(element);
        }
    });
}

// Animate Counter
function animateCounter(elementId, targetValue) {
    const element = document.getElementById(elementId);
    if (!element) return;

    const duration = 2000;
    const startTime = performance.now();

    function updateCounter(currentTime) {
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / duration, 1);
        
        const easeOut = 1 - Math.pow(1 - progress, 3);
        const currentValue = targetValue * easeOut;

        if (elementId === 'roi-avg') {
            element.textContent = currentValue.toFixed(1) + 'x';
        } else {
            element.textContent = Math.floor(currentValue) + (elementId === 'experience-years' ? '+' : '+');
        }

        if (progress < 1) {
            requestAnimationFrame(updateCounter);
        }
    }

    requestAnimationFrame(updateCounter);
}

// Platform Tabs
function initPlatformTabs() {
    const tabs = document.querySelectorAll('.platform-tab');
    
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            // Remove active class from all tabs
            tabs.forEach(t => t.classList.remove('active'));
            
            // Add active class to clicked tab
            tab.classList.add('active');
            
            // Update dashboard data based on platform
            const platform = tab.dataset.platform;
            updateDashboardData(platform);
        });
    });
}

// Update Dashboard Data
function updateDashboardData(platform) {
    const platformData = {
        facebook: {
            followers: 15420,
            engagement: 4.8,
            reach: 89250,
            roi: 285
        },
        instagram: {
            followers: 28350,
            engagement: 6.2,
            reach: 156800,
            roi: 320
        },
        twitter: {
            followers: 8900,
            engagement: 3.1,
            reach: 45200,
            roi: 195
        },
        linkedin: {
            followers: 12300,
            engagement: 5.7,
            reach: 67800,
            roi: 410
        },
        tiktok: {
            followers: 45600,
            engagement: 8.9,
            reach: 234500,
            roi: 380
        }
    };

    const data = platformData[platform] || platformData.facebook;
    
    // Animate to new values
    animateMetric('followers-count', data.followers);
    animateMetric('engagement-rate', data.engagement);
    animateMetric('reach-count', data.reach);
    animateMetric('roi-percentage', data.roi);

    // Update charts
    updateCharts(platform);
}

// Initialize Charts
function initCharts() {
    initGrowthChart();
    initEngagementChart();
}

// Growth Chart
function initGrowthChart() {
    const chartElement = document.getElementById('growth-chart');
    if (!chartElement) return;

    const chart = echarts.init(chartElement);
    
    const option = {
        color: ['#7c9885', '#c4896b'],
        tooltip: {
            trigger: 'axis',
            backgroundColor: 'rgba(255, 255, 255, 0.95)',
            borderColor: '#e8e8e8',
            textStyle: {
                color: '#1a1a1a'
            }
        },
        grid: {
            left: '3%',
            right: '4%',
            bottom: '3%',
            containLabel: true
        },
        xAxis: {
            type: 'category',
            data: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'],
            axisLine: {
                lineStyle: {
                    color: '#e8e8e8'
                }
            },
            axisLabel: {
                color: '#6b7c93'
            }
        },
        yAxis: {
            type: 'value',
            axisLine: {
                show: false
            },
            axisTick: {
                show: false
            },
            axisLabel: {
                color: '#6b7c93'
            },
            splitLine: {
                lineStyle: {
                    color: '#f0f0f0'
                }
            }
        },
        series: [{
            name: 'Followers',
            type: 'line',
            smooth: true,
            data: [12000, 13200, 14500, 15420, 16800, 18200],
            lineStyle: {
                width: 3
            },
            areaStyle: {
                opacity: 0.1
            }
        }]
    };

    chart.setOption(option);
    
    // Store chart instance for updates
    window.growthChart = chart;
}

// Engagement Chart
function initEngagementChart() {
    const chartElement = document.getElementById('engagement-chart');
    if (!chartElement) return;

    const chart = echarts.init(chartElement);
    
    const option = {
        color: ['#7c9885', '#c4896b', '#6b7c93'],
        tooltip: {
            trigger: 'item',
            backgroundColor: 'rgba(255, 255, 255, 0.95)',
            borderColor: '#e8e8e8',
            textStyle: {
                color: '#1a1a1a'
            }
        },
        legend: {
            bottom: '0%',
            textStyle: {
                color: '#6b7c93'
            }
        },
        series: [{
            name: 'Engagement',
            type: 'pie',
            radius: ['40%', '70%'],
            center: ['50%', '45%'],
            data: [
                { value: 35, name: 'Video Content' },
                { value: 28, name: 'Image Posts' },
                { value: 22, name: 'Stories' },
                { value: 15, name: 'Carousels' }
            ],
            emphasis: {
                itemStyle: {
                    shadowBlur: 10,
                    shadowOffsetX: 0,
                    shadowColor: 'rgba(0, 0, 0, 0.5)'
                }
            }
        }]
    };

    chart.setOption(option);
    
    // Store chart instance for updates
    window.engagementChart = chart;
}

// Update Charts based on platform
function updateCharts(platform) {
    const growthData = {
        facebook: [12000, 13200, 14500, 15420, 16800, 18200],
        instagram: [22000, 24500, 26800, 28350, 31200, 33800],
        twitter: [7200, 7800, 8300, 8900, 9500, 10200],
        linkedin: [9800, 10800, 11800, 12300, 13600, 14900],
        tiktok: [32000, 36500, 41200, 45600, 50200, 55800]
    };

    const engagementData = {
        facebook: [
            { value: 32, name: 'Video Content' },
            { value: 25, name: 'Image Posts' },
            { value: 28, name: 'Stories' },
            { value: 15, name: 'Carousels' }
        ],
        instagram: [
            { value: 45, name: 'Reels' },
            { value: 22, name: 'Stories' },
            { value: 18, name: 'Posts' },
            { value: 15, name: 'IGTV' }
        ],
        twitter: [
            { value: 40, name: 'Video' },
            { value: 30, name: 'Images' },
            { value: 20, name: 'Threads' },
            { value: 10, name: 'Polls' }
        ],
        linkedin: [
            { value: 38, name: 'Articles' },
            { value: 28, name: 'Video' },
            { value: 20, name: 'Images' },
            { value: 14, name: 'Documents' }
        ],
        tiktok: [
            { value: 60, name: 'Dance/Challenge' },
            { value: 25, name: 'Educational' },
            { value: 10, name: 'Behind Scenes' },
            { value: 5, name: 'Product Showcases' }
        ]
    };

    // Update growth chart
    if (window.growthChart && growthData[platform]) {
        window.growthChart.setOption({
            series: [{
                data: growthData[platform]
            }]
        });
    }

    // Update engagement chart
    if (window.engagementChart && engagementData[platform]) {
        window.engagementChart.setOption({
            series: [{
                data: engagementData[platform]
            }]
        });
    }
}

// Resize charts on window resize
window.addEventListener('resize', () => {
    if (window.growthChart) {
        window.growthChart.resize();
    }
    if (window.engagementChart) {
        window.engagementChart.resize();
    }
});

// Utility Functions
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// Smooth page transitions
function initPageTransitions() {
    const links = document.querySelectorAll('a[href$=".html"]');
    
    links.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const href = link.getAttribute('href');
            
            // Fade out animation
            document.body.style.opacity = '0.8';
            document.body.style.transform = 'scale(0.98)';
            document.body.style.transition = 'all 0.3s ease';
            
            setTimeout(() => {
                window.location.href = href;
            }, 300);
        });
    });
}

// Initialize page transitions
initPageTransitions();

// Add loading states for buttons
document.querySelectorAll('.btn-primary').forEach(button => {
    button.addEventListener('click', function(e) {
        if (this.href && this.href.includes('.html')) {
            this.style.transform = 'scale(0.95)';
            this.style.opacity = '0.8';
        }
    });
});

// Form validation helper
function validateEmail(email) {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(email);
}

// Local storage helpers
function saveToLocalStorage(key, data) {
    try {
        localStorage.setItem(key, JSON.stringify(data));
    } catch (e) {
        console.warn('Could not save to localStorage:', e);
    }
}

function getFromLocalStorage(key) {
    try {
        const item = localStorage.getItem(key);
        return item ? JSON.parse(item) : null;
    } catch (e) {
        console.warn('Could not read from localStorage:', e);
        return null;
    }
}

// Analytics tracking (placeholder)
function trackEvent(eventName, properties = {}) {
    console.log('Event tracked:', eventName, properties);
    // Implement actual analytics tracking here
}

// Track page views
trackEvent('page_view', {
    page: window.location.pathname,
    timestamp: new Date().toISOString()
});

// Track CTA clicks
document.querySelectorAll('a[href*=".html"], .btn-primary').forEach(element => {
    element.addEventListener('click', () => {
        trackEvent('cta_click', {
            element: element.textContent.trim(),
            href: element.href || 'button'
        });
    });
});

console.log('SocialTush website initialized successfully! 🚀');