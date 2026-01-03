# SocialTush Website - Design Style Guide

## Design Philosophy

### Visual Language
The modernized SocialTush website embraces a **sophisticated editorial aesthetic** inspired by premium digital publications like Kinfolk and Wired. The design philosophy centers on creating immediate emotional and cognitive impact through bold typography, strategic use of negative space, and cinematic imagery that positions SocialTush as a premium, results-driven marketing partner.

### Color Palette
**Primary Colors:**
- Deep Charcoal (#1a1a1a) - Main text and strong contrast elements
- Warm White (#fafafa) - Background and clean space
- Sage Green (#7c9885) - Primary brand accent, representing growth and stability
- Terracotta (#c4896b) - Secondary accent for warmth and energy

**Supporting Colors:**
- Soft Gray (#e8e8e8) - Subtle borders and dividers
- Muted Blue (#6b7c93) - Data visualization and interactive elements
- Cream (#f5f3f0) - Section backgrounds and cards

**Color Usage Guidelines:**
- Maximum of 3 colors per page section
- 4.5:1 contrast ratio minimum for all text
- Sage green used sparingly for maximum impact
- No pure saturated colors - all hues are muted and sophisticated

### Typography
**Display Font:** Canela (serif)
- Used for: Main headings, hero text, section titles
- Weights: Regular, Medium, Bold
- Creates emotional impact and premium feel

**Body Font:** Suisse Int'l (sans-serif)
- Used for: Body text, navigation, UI elements
- Weights: Regular, Medium, SemiBold
- Ensures excellent readability and modern feel

**Font Hierarchy:**
- H1: Canela Bold, 3.5rem (56px), line-height 1.1
- H2: Canela Medium, 2.5rem (40px), line-height 1.2
- H3: Suisse SemiBold, 1.5rem (24px), line-height 1.3
- Body: Suisse Regular, 1rem (16px), line-height 1.6
- Small: Suisse Regular, 0.875rem (14px), line-height 1.4

## Visual Effects & Animation

### Background Effects
**Primary:** Aurora gradient flow using CSS animations
- Subtle, slow-moving gradient that shifts between sage green and terracotta
- Creates depth without distraction
- Implemented using CSS custom properties and keyframe animations

**Secondary:** Geometric pattern overlay
- Subtle dot grid or diagonal lines in very light gray
- Adds texture without overwhelming content

### Text Effects
**Hero Section:** Typewriter animation with Typed.js
- Main headline types out character by character
- Cursor blinks naturally
- Color cycling emphasis on key words (sage green to terracotta)

**Section Headings:** Split-by-letter stagger animation
- Letters animate in from bottom with subtle fade
- Staggered timing creates elegant reveal effect
- Implemented using Splitting.js library

**Data Counters:** Animated number counting
- Numbers count up from zero when in viewport
- Smooth easing for premium feel
- Used for statistics and metrics

### Interactive Elements
**Buttons:** 3D tilt effect on hover
- Subtle perspective shift using CSS transforms
- Shadow expands and softens
- Color transitions with cubic-bezier easing

**Cards:** Lift and shadow expansion
- Cards rise slightly on hover
- Shadow becomes larger and softer
- Content scales up 1.02x for subtle zoom effect

**Images:** Ken Burns pan/zoom effect
- Subtle zoom and pan on hover
- Creates cinematic, premium feel
- Works especially well for hero images

### Scroll Motion Effects
**Reveal Animations:**
- Elements fade in with 20px upward movement
- Trigger when element enters top 50% of viewport
- 200ms duration with ease-out timing
- Staggered delays for grouped elements

**Parallax Elements:**
- Background elements move at 0.5x scroll speed
- Maximum displacement of 8% viewport height
- Applied only to decorative elements
- Maintains readability and accessibility

## Layout & Composition

### Grid System
**Desktop:** 12-column grid with 24px gutters
**Tablet:** 8-column grid with 20px gutters  
**Mobile:** 4-column grid with 16px gutters

### Spacing Scale
- xs: 4px
- sm: 8px
- md: 16px
- lg: 24px
- xl: 32px
- 2xl: 48px
- 3xl: 64px
- 4xl: 96px

### Section Structure
**Hero Section:**
- Full viewport height (100vh)
- Centered content with max-width 1200px
- Background image with overlay gradient
- CTA button prominent with hover effects

**Content Sections:**
- Consistent 96px vertical padding
- Alternating layouts (left/right content)
- Decorative elements on section edges
- Clear visual hierarchy

## Component Design

### Navigation
- Fixed header with backdrop blur
- Logo left, navigation center, CTA right
- Smooth scroll to sections
- Mobile hamburger with slide-out menu

### Cards
- Subtle border (1px solid #e8e8e8)
- 8px border radius
- 24px padding
- Hover elevation with shadow
- Consistent aspect ratios for images

### Forms
- Clean, minimal styling
- Floating labels with smooth transitions
- Focus states with sage green accent
- Inline validation with gentle animations
- Submit buttons with loading states

### Data Visualization
- Muted color palette (saturation < 50%)
- Maximum 3 colors per chart
- Clean typography for labels
- Interactive hover states
- Responsive design for all screen sizes

## Image Treatment

### Photography Style
- High-contrast, cinematic imagery
- Natural lighting with moody atmosphere
- People in authentic work environments
- Abstract textures and architectural elements
- Consistent color grading matching brand palette

### Image Specifications
- Hero images: 1920x1080 minimum
- Card images: 600x400 (3:2 aspect ratio)
- Profile images: 400x400 (square)
- All images optimized for web (WebP format)

## Responsive Design

### Breakpoints
- Mobile: 320px - 767px
- Tablet: 768px - 1023px
- Desktop: 1024px - 1439px
- Large Desktop: 1440px+

### Mobile-First Approach
- Touch targets minimum 44px
- Simplified navigation
- Stacked layouts
- Reduced font sizes appropriately
- Optimized images for mobile bandwidth

## Accessibility Standards

### Color Contrast
- All text meets WCAG AA standards (4.5:1)
- Interactive elements have clear focus states
- Color is never the only way to convey information

### Typography
- Minimum 16px font size for body text
- Line height 1.6 for optimal readability
- Adequate spacing between interactive elements

### Motion
- Respect prefers-reduced-motion settings
- Provide toggle for animation preferences
- Ensure content is visible without animations

This design system creates a cohesive, premium experience that positions SocialTush as a sophisticated, results-driven marketing partner while maintaining excellent usability and accessibility standards.