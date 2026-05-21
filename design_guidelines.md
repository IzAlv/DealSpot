{
  "brand": {
    "name": "PIR GRAIN & PULSES",
    "product_subtitle": "Agricultural Commodity Trading Dashboard",
    "attributes": [
      "professional",
      "trustworthy",
      "data-dense",
      "calm/low-fatigue",
      "operations-first",
      "audit-friendly"
    ],
    "visual_personality": {
      "style_fusion": [
        "Swiss/International Typographic Style (grid + clarity)",
        "B2B Fintech dashboard density (tables + filters)",
        "Soft industrial agriculture cues (wheat/silo imagery, warm accent)"
      ],
      "do_not": [
        "No playful gradients or loud neon",
        "No purple",
        "No centered app container layouts",
        "No heavy shadows or glassy cards that reduce legibility"
      ]
    }
  },
  "design_tokens": {
    "css_custom_properties": {
      "location": "/app/frontend/src/index.css",
      "instructions": [
        "Replace :root HSL tokens to match the palette below (keep shadcn token names).",
        "Keep cards white; use slate-tinted app background.",
        "Sidebar uses a dark teal/blue surface token (custom utility class or CSS var)."
      ],
      "tokens": {
        "--background": "210 40% 98%",
        "--foreground": "222 47% 11%",
        "--card": "0 0% 100%",
        "--card-foreground": "222 47% 11%",
        "--popover": "0 0% 100%",
        "--popover-foreground": "222 47% 11%",
        "--primary": "191 91% 28%",
        "--primary-foreground": "210 40% 98%",
        "--secondary": "210 40% 96%",
        "--secondary-foreground": "222 47% 11%",
        "--muted": "210 40% 96%",
        "--muted-foreground": "215 16% 35%",
        "--accent": "190 70% 92%",
        "--accent-foreground": "191 91% 20%",
        "--destructive": "0 72% 51%",
        "--destructive-foreground": "210 40% 98%",
        "--border": "214 32% 91%",
        "--input": "214 32% 91%",
        "--ring": "191 91% 28%",
        "--radius": "0.75rem",
        "--chart-1": "191 91% 28%",
        "--chart-2": "199 89% 48%",
        "--chart-3": "215 25% 27%",
        "--chart-4": "38 92% 50%",
        "--chart-5": "162 63% 41%"
      }
    },
    "palette": {
      "backgrounds": {
        "app": "#f1f5f9 (slate-100)",
        "app_alt": "#f8fafc (slate-50)",
        "card": "#ffffff",
        "card_subtle": "#f8fafc"
      },
      "primary": {
        "brand": "#0e7490 (teal/cyan-700)",
        "brand_hover": "#155e75 (cyan-800)",
        "brand_soft": "#cffafe (cyan-100)",
        "brand_ring": "rgba(14,116,144,0.35)"
      },
      "sidebar": {
        "surface": "#0b2f3a (deep teal-blue)",
        "surface_2": "#0a2530",
        "text": "#e6f6fb",
        "muted": "rgba(230,246,251,0.72)",
        "active": "rgba(34,211,238,0.16)",
        "border": "rgba(148,163,184,0.18)"
      },
      "neutrals": {
        "text": "#0f172a (slate-900)",
        "muted_text": "#475569 (slate-600)",
        "lines": "#e2e8f0 (slate-200)"
      },
      "accents": {
        "grain": "#d6a24a (wheat gold)",
        "grain_soft": "#fff7e6",
        "signal": "#f59e0b (amber-500)"
      },
      "status_system": {
        "note": "Use Badge variants + custom className per status. Keep text readable; prefer solid light backgrounds with dark text.",
        "statuses_16": {
          "draft": {"bg": "#e2e8f0", "fg": "#0f172a", "dot": "#64748b"},
          "initiated": {"bg": "#e0f2fe", "fg": "#075985", "dot": "#0284c7"},
          "pending-approval": {"bg": "#fef9c3", "fg": "#854d0e", "dot": "#eab308"},
          "approved": {"bg": "#dcfce7", "fg": "#166534", "dot": "#22c55e"},
          "rejected": {"bg": "#fee2e2", "fg": "#991b1b", "dot": "#ef4444"},
          "counterparty-confirmation": {"bg": "#ede9fe", "fg": "#4c1d95", "dot": "#7c3aed"},
          "contract-sent": {"bg": "#e0f2fe", "fg": "#0c4a6e", "dot": "#38bdf8"},
          "contract-signed": {"bg": "#dcfce7", "fg": "#14532d", "dot": "#16a34a"},
          "scheduled": {"bg": "#cffafe", "fg": "#155e75", "dot": "#06b6d4"},
          "in-transit": {"bg": "#ffedd5", "fg": "#9a3412", "dot": "#fb923c"},
          "at-port": {"bg": "#e0e7ff", "fg": "#3730a3", "dot": "#6366f1"},
          "loaded": {"bg": "#dcfce7", "fg": "#166534", "dot": "#22c55e"},
          "unloaded": {"bg": "#f1f5f9", "fg": "#0f172a", "dot": "#94a3b8"},
          "documents-pending": {"bg": "#fef3c7", "fg": "#92400e", "dot": "#f59e0b"},
          "invoiced": {"bg": "#e0f2fe", "fg": "#075985", "dot": "#0ea5e9"},
          "completed": {"bg": "#dcfce7", "fg": "#14532d", "dot": "#16a34a"}
        }
      }
    },
    "shadows_radius_spacing": {
      "radius": {
        "card": "rounded-xl",
        "input": "rounded-md",
        "button": "rounded-md",
        "badge": "rounded-full"
      },
      "shadow": {
        "card": "shadow-[0_1px_2px_rgba(2,6,23,0.06),0_8px_24px_rgba(2,6,23,0.06)]",
        "card_hover": "hover:shadow-[0_2px_4px_rgba(2,6,23,0.08),0_12px_32px_rgba(2,6,23,0.08)]",
        "sidebar": "shadow-[inset_-1px_0_0_rgba(148,163,184,0.18)]"
      },
      "spacing": {
        "page_padding": "p-4 sm:p-6 lg:p-8",
        "card_padding": "p-4 sm:p-5",
        "section_gap": "gap-4 sm:gap-6",
        "table_density": "py-2.5 sm:py-3"
      },
      "grid": {
        "dashboard": "grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-6",
        "kpi_row": "grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4",
        "content_main": "lg:col-span-8",
        "content_side": "lg:col-span-4"
      }
    }
  },
  "typography": {
    "fonts": {
      "heading": {
        "family": "Space Grotesk",
        "fallback": "ui-sans-serif, system-ui",
        "usage": "App headings, page titles, KPI numbers"
      },
      "body": {
        "family": "Inter",
        "fallback": "ui-sans-serif, system-ui",
        "usage": "Tables, forms, helper text"
      },
      "mono": {
        "family": "IBM Plex Mono",
        "usage": "Trade IDs, invoice numbers, vessel IMO"
      },
      "implementation": {
        "google_fonts": [
          "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Space+Grotesk:wght@500;600;700&family=IBM+Plex+Mono:wght@400;500&display=swap"
        ],
        "tailwind_usage": {
          "heading_class": "font-[\"Space Grotesk\"]",
          "body_class": "font-[\"Inter\"]",
          "mono_class": "font-[\"IBM Plex Mono\"]"
        }
      }
    },
    "type_scale": {
      "h1": "text-4xl sm:text-5xl lg:text-6xl font-semibold tracking-tight",
      "h2": "text-base md:text-lg text-slate-600",
      "page_title": "text-xl sm:text-2xl font-semibold tracking-tight",
      "card_title": "text-sm font-medium text-slate-600",
      "kpi_value": "text-2xl font-semibold tabular-nums",
      "table": "text-sm",
      "helper": "text-xs text-slate-500"
    }
  },
  "layout": {
    "app_shell": {
      "pattern": "Sidebar + top header (optional) + scrollable content",
      "sidebar_width": {
        "expanded": "w-[264px]",
        "collapsed": "w-[76px]"
      },
      "content": {
        "background": "bg-slate-100",
        "max_width": "max-w-[1400px] (center within content only, not whole app)",
        "container": "mx-auto w-full"
      },
      "header": {
        "height": "h-14",
        "elements": [
          "Breadcrumb",
          "Global search (Command)",
          "Quick actions (New Trade)",
          "User menu"
        ]
      }
    },
    "login_page": {
      "layout": "Two-column on desktop: left brand panel (subtle image), right login card. On mobile: stacked with card first.",
      "background": "bg-slate-100 with subtle noise overlay",
      "card": "max-w-md w-full rounded-2xl bg-white shadow-[...] border border-slate-200",
      "brand_mark": "Simple wheat/grain mark in teal + wheat-gold accent (SVG)."
    },
    "dashboard_page": {
      "sections": [
        "Welcome row (greeting + quick actions)",
        "KPI cards row",
        "Main grid: Trade Progress + Upcoming Events (calendar widget)",
        "Secondary: Recent trades table snippet"
      ]
    }
  },
  "components": {
    "component_path": {
      "shadcn_ui": {
        "button": "/app/frontend/src/components/ui/button.jsx",
        "input": "/app/frontend/src/components/ui/input.jsx",
        "label": "/app/frontend/src/components/ui/label.jsx",
        "card": "/app/frontend/src/components/ui/card.jsx",
        "badge": "/app/frontend/src/components/ui/badge.jsx",
        "table": "/app/frontend/src/components/ui/table.jsx",
        "dialog": "/app/frontend/src/components/ui/dialog.jsx",
        "alert_dialog": "/app/frontend/src/components/ui/alert-dialog.jsx",
        "select": "/app/frontend/src/components/ui/select.jsx",
        "tabs": "/app/frontend/src/components/ui/tabs.jsx",
        "calendar": "/app/frontend/src/components/ui/calendar.jsx",
        "popover": "/app/frontend/src/components/ui/popover.jsx",
        "dropdown_menu": "/app/frontend/src/components/ui/dropdown-menu.jsx",
        "command": "/app/frontend/src/components/ui/command.jsx",
        "sheet": "/app/frontend/src/components/ui/sheet.jsx",
        "collapsible": "/app/frontend/src/components/ui/collapsible.jsx",
        "progress": "/app/frontend/src/components/ui/progress.jsx",
        "separator": "/app/frontend/src/components/ui/separator.jsx",
        "scroll_area": "/app/frontend/src/components/ui/scroll-area.jsx",
        "sonner": "/app/frontend/src/components/ui/sonner.jsx"
      }
    },
    "navigation": {
      "sidebar": {
        "structure": [
          "Brand block (logo + name)",
          "Primary nav (Dashboard, Trades, Partners, Vessels, Documents)",
          "Operations (Calendar, Commissions, Reports)",
          "Settings"
        ],
        "collapsible_sections": "Use Collapsible for grouped nav (e.g., Partners -> All/Buyers/Sellers/Co-Brokers).",
        "active_state": "bg-[rgba(34,211,238,0.16)] text-white; left indicator bar w-1 bg-cyan-300",
        "hover_state": "hover:bg-[rgba(148,163,184,0.10)]",
        "icon_style": "lucide-react icons, 18px, strokeWidth=2"
      },
      "top_search": {
        "component": "Command",
        "behavior": "Cmd/Ctrl+K opens global search for trades/partners/docs; results grouped; recent searches persisted in localStorage."
      }
    },
    "tables": {
      "style": {
        "container": "rounded-xl border border-slate-200 bg-white",
        "header": "bg-slate-50 text-slate-700",
        "row": "hover:bg-slate-50/70",
        "cell": "py-3",
        "density_toggle": "Optional: compact/comfortable toggle using Switch"
      },
      "toolbar": {
        "left": [
          "Search Input",
          "Status Select (multi or single)",
          "Date range (Popover + Calendar)",
          "Clear filters Button (ghost)"
        ],
        "right": [
          "New Trade Button",
          "Export Dropdown (CSV/PDF)",
          "Column visibility Dropdown"
        ]
      },
      "row_actions": {
        "pattern": "DropdownMenu with Edit/Delete; Delete uses AlertDialog confirmation.",
        "testids": [
          "trade-row-actions-menu-button",
          "trade-row-edit-menu-item",
          "trade-row-delete-menu-item",
          "trade-delete-confirm-button"
        ]
      }
    },
    "forms_modals": {
      "create_edit": "Use Dialog for create/edit forms. Use Form + Input/Select/Textarea. Keep labels above inputs.",
      "footer": "Right-aligned actions: Cancel (secondary) + Save (primary).",
      "validation": "Inline error text under field (text-xs text-red-600) and aria-describedby.",
      "testids": [
        "modal-save-button",
        "modal-cancel-button"
      ]
    },
    "cards_kpis": {
      "kpi_card": {
        "layout": "CardHeader: label + icon; CardContent: value + delta",
        "number_style": "tabular-nums",
        "hover": "subtle lift (translate-y-0.5) + shadow increase"
      },
      "trade_progress": {
        "component": "Progress",
        "style": "Progress bar in brand teal; show step labels below as small badges"
      }
    },
    "calendar_widgets": {
      "upcoming_events": {
        "component": "Calendar",
        "pattern": "Right rail widget: month view + list of events below",
        "event_chip": "Badge with dot + time; click opens Dialog with details"
      }
    },
    "reports_charts": {
      "library": "recharts",
      "chart_container": "Card with header controls (Tabs for timeframe, Select for commodity)",
      "colors": [
        "--chart-1 (teal)",
        "--chart-2 (sky)",
        "--chart-4 (amber accent for volume)"
      ],
      "empty_state": "Use Skeleton for loading; for empty show centered message + ghost button to add data (not full-page)."
    },
    "documents": {
      "upload": "Use input type=file inside Card; show uploaded docs in Table; status badges for 'received/reviewed/approved'.",
      "preview": "Use Dialog with ScrollArea for metadata; download button primary."
    },
    "toasts": {
      "library": "sonner",
      "usage": "Success: teal accent; Error: red; include action buttons for Undo where relevant."
    }
  },
  "motion_microinteractions": {
    "library": {
      "recommended": "framer-motion",
      "install": "npm i framer-motion",
      "usage": [
        "Page transitions: fade + slight y",
        "Card hover: shadow + y",
        "Sidebar collapse: width animation",
        "Table row hover: background only (no transform to avoid jitter)"
      ]
    },
    "principles": {
      "durations": {
        "fast": "120-160ms",
        "base": "180-220ms",
        "slow": "260-320ms"
      },
      "easing": "cubic-bezier(0.2, 0.8, 0.2, 1)",
      "hover": [
        "Buttons: bg shade shift + subtle shadow",
        "Cards: shadow increase + translate-y-0.5",
        "Sidebar items: background tint + left indicator"
      ],
      "scroll": "Sticky table toolbar on long lists; subtle shadow appears when stuck"
    }
  },
  "accessibility": {
    "requirements": [
      "WCAG AA contrast for text on slate backgrounds",
      "Visible focus ring: ring-2 ring-[color:var(--ring)] ring-offset-2 ring-offset-slate-100",
      "Keyboard navigation for sidebar, tables, dialogs",
      "Use aria-label for icon-only buttons",
      "Respect prefers-reduced-motion (disable large motion)"
    ]
  },
  "testing_attributes": {
    "rule": "All interactive and key informational elements MUST include data-testid (kebab-case).",
    "examples": {
      "login": [
        "login-username-input",
        "login-password-input",
        "login-submit-button",
        "login-demo-credentials"
      ],
      "sidebar": [
        "sidebar-toggle-button",
        "sidebar-nav-dashboard-link",
        "sidebar-nav-trades-link",
        "sidebar-nav-partners-link"
      ],
      "dashboard": [
        "kpi-active-trades-card",
        "kpi-pending-trades-card",
        "kpi-completed-trades-card",
        "trade-progress-card",
        "upcoming-events-card"
      ],
      "tables": [
        "trades-search-input",
        "trades-new-trade-button",
        "trades-status-filter-select",
        "trades-table"
      ]
    }
  },
  "image_urls": {
    "login_brand_panel": [
      {
        "url": "https://images.unsplash.com/photo-1713612487014-31a4d9bc520a?crop=entropy&cs=srgb&fm=jpg&ixid=M3w3NDk1Nzd8MHwxfHNlYXJjaHwzfHx3aGVhdCUyMGdyYWluJTIwY2xvc2UlMjB1cCUyMG1pbmltYWx8ZW58MHx8fHRlYWx8MTc3NDA4NDAzOHww&ixlib=rb-4.1.0&q=85",
        "description": "Soft wheat field close-up; use as subtle left panel background with 10–16% opacity overlay"
      },
      {
        "url": "https://images.unsplash.com/photo-1716661793254-48fb0b856975?crop=entropy&cs=srgb&fm=jpg&ixid=M3w3NDk1Nzd8MHwxfHNlYXJjaHwyfHx3aGVhdCUyMGdyYWluJTIwY2xvc2UlMjB1cCUyMG1pbmltYWx8ZW58MHx8fHRlYWx8MTc3NDA4NDAzOHww&ixlib=rb-4.1.0&q=85",
        "description": "Wide green wheat field; use for marketing/empty state illustration area"
      }
    ],
    "vessels_page": [
      {
        "url": "https://images.unsplash.com/photo-1604946512162-b3021c1a57c8?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjA1NTZ8MHwxfHNlYXJjaHwzfHxjYXJnbyUyMHNoaXAlMjB2ZXNzZWwlMjBwb3J0JTIwYWVyaWFsJTIwbWluaW1hbHxlbnwwfHx8Ymx1ZXwxNzc0MDg0MDQyfDA&ixlib=rb-4.1.0&q=85",
        "description": "Cargo vessel at sea; use as header image in Vessels empty state (cropped, subtle)"
      },
      {
        "url": "https://images.pexels.com/photos/3848788/pexels-photo-3848788.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940",
        "description": "Aerial docked cargo ship; use for reports/hero banner in Reports page (low opacity)"
      }
    ],
    "documents_page": [
      {
        "url": "https://images.pexels.com/photos/2965707/pexels-photo-2965707.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940",
        "description": "Truck unloading grain; use as subtle illustration in Documents empty state"
      }
    ]
  },
  "instructions_to_main_agent": {
    "global_css_cleanup": [
      "Remove/stop using /app/frontend/src/App.css default CRA centered header styles; do not apply .App { text-align:center }.",
      "Set body font to Inter; headings use Space Grotesk via Tailwind class or CSS.",
      "Implement app background as slate-100; cards remain white with subtle border and shadow."
    ],
    "sidebar_implementation_notes": [
      "Use a fixed sidebar with dark teal surface; add collapse toggle.",
      "Use Collapsible for grouped nav sections.",
      "Ensure nav links have data-testid and visible focus states."
    ],
    "tables_and_filters": [
      "Use shadcn Table primitives; build a toolbar with Input + Select + Calendar popover.",
      "Status badges: implement mapping for 16 statuses (above) and ensure consistent colors.",
      "Row actions via DropdownMenu; destructive actions via AlertDialog."
    ],
    "forms": [
      "All create/edit flows in Dialog modals.",
      "Use sonner toasts for success/error.",
      "Add data-testid to every input, select trigger, submit/cancel button, and key info text."
    ],
    "charts": [
      "Use recharts inside Card; keep gridlines subtle (stroke slate-200).",
      "Use chart colors from CSS vars; avoid gradients in charts except very subtle area fill (opacity <= 0.12)."
    ]
  },
  "general_ui_ux_design_guidelines_appendix": "<General UI UX Design Guidelines>  \n    - You must **not** apply universal transition. Eg: `transition: all`. This results in breaking transforms. Always add transitions for specific interactive elements like button, input excluding transforms\n    - You must **not** center align the app container, ie do not add `.App { text-align: center; }` in the css file. This disrupts the human natural reading flow of text\n   - NEVER: use AI assistant Emoji characters like`🤖🧠💭💡🔮🎯📚🎭🎬🎪🎉🎊🎁🎀🎂🍰🎈🎨🎰💰💵💳🏦💎🪙💸🤑📊📈📉💹🔢🏆🥇 etc for icons. Always use **FontAwesome cdn** or **lucid-react** library already installed in the package.json\n\n **GRADIENT RESTRICTION RULE**\nNEVER use dark/saturated gradient combos (e.g., purple/pink) on any UI element.  Prohibited gradients: blue-500 to purple 600, purple 500 to pink-500, green-500 to blue-500, red to pink etc\nNEVER use dark gradients for logo, testimonial, footer etc\nNEVER let gradients cover more than 20% of the viewport.\nNEVER apply gradients to text-heavy content or reading areas.\nNEVER use gradients on small UI elements (<100px width).\nNEVER stack multiple gradient layers in the same viewport.\n\n**ENFORCEMENT RULE:**\n    • Id gradient area exceeds 20% of viewport OR affects readability, **THEN** use solid colors\n\n**How and where to use:**\n   • Section backgrounds (not content backgrounds)\n   • Hero section header content. Eg: dark to light to dark color\n   • Decorative overlays and accent elements only\n   • Hero section with 2-3 mild color\n   • Gradients creation can be done for any angle say horizontal, vertical or diagonal\n\n- For AI chat, voice application, **do not use purple color. Use color like light green, ocean blue, peach orange etc**\n\n</Font Guidelines>\n\n- Every interaction needs micro-animations - hover states, transitions, parallax effects, and entrance animations. Static = dead. \n   \n- Use 2-3x more spacing than feels comfortable. Cramped designs look cheap.\n\n- Subtle grain textures, noise overlays, custom cursors, selection states, and loading animations: separates good from extraordinary.\n   \n- Before generating UI, infer the visual style from the problem statement (palette, contrast, mood, motion) and immediately instantiate it by setting global design tokens (primary, secondary/accent, background, foreground, ring, state colors), rather than relying on any library defaults. Don't make the background dark as a default step, always understand problem first and define colors accordingly\n    Eg: - if it implies playful/energetic, choose a colorful scheme\n           - if it implies monochrome/minimal, choose a black–white/neutral scheme\n\n**Component Reuse:**\n\t- Prioritize using pre-existing components from src/components/ui when applicable\n\t- Create new components that match the style and conventions of existing components when needed\n\t- Examine existing components to understand the project's component patterns before creating new ones\n\n**IMPORTANT**: Do not use HTML based component like dropdown, calendar, toast etc. You **MUST** always use `/app/frontend/src/components/ui/ ` only as a primary components as these are modern and stylish component\n\n**Best Practices:**\n\t- Use Shadcn/UI as the primary component library for consistency and accessibility\n\t- Import path: ./components/[component-name]\n\n**Export Conventions:**\n\t- Components MUST use named exports (export const ComponentName = ...)\n\t- Pages MUST use default exports (export default function PageName() {...})\n\n**Toasts:**\n  - Use `sonner` for toasts\"\n  - Sonner component are located in `/app/src/components/ui/sonner.tsx`\n\nUse 2–4 color gradients, subtle textures/noise overlays, or CSS-based noise to avoid flat visuals.\n</General UI UX Design Guidelines>"
}
