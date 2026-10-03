export const QUALITY_CASES = [
    {
        name: "responsive-product-landing-page",
        prompt: "Build a polished responsive landing page for a modern productivity app called FocusFlow. Include a navigation bar, hero section, primary and secondary CTA buttons, feature cards, a workflow section, testimonials, pricing, and a footer. Use a refined editorial visual system with warm neutrals and one accent color.",
        requirements: [
            { name: "responsive-css", pattern: /@media\s*\(/i },
            { name: "primary-action", pattern: /button|cta|sign up|get started/i },
            { name: "feature-content", pattern: /feature|workflow/i },
        ],
    },
    {
        name: "interactive-task-board",
        prompt: "Build a working task board for a small product team. Include columns for Backlog, In Progress, and Done; add-task form; task counts; search or filtering; and controls to move or remove tasks. Make it polished, keyboard-friendly, responsive, and usable without a backend.",
        requirements: [
            { name: "interactive-state", pattern: /useState|useReducer/i },
            { name: "form-control", pattern: /<form|onSubmit/i },
            { name: "task-board-content", pattern: /backlog|in progress|done/i },
        ],
    },
    {
        name: "restaurant-menu",
        prompt: "Build a polished restaurant website for a contemporary Indian restaurant called Ember & Spice. Include navigation, hero imagery, menu category filtering, signature dishes, reservation CTA, location and hours, and a responsive footer. Use rich colors, strong typography, and accessible controls.",
        requirements: [
            { name: "menu-content", pattern: /menu|dish|cuisine/i },
            { name: "filtering-or-tabs", pattern: /filter|category|setActive/i },
            { name: "responsive-css", pattern: /@media\s*\(/i },
        ],
    },
];
