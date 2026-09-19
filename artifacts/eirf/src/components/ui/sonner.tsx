'use client';

import { Toaster as Sonner } from 'sonner';

type ToasterProps = React.ComponentProps<typeof Sonner>;

// This app has two fixed themes (dark "command center" login vs. light
// operational UI, see the UI/UX audit) but no user-facing dark-mode
// toggle — next-themes was installed and wired into useTheme() here with
// nothing to actually drive it, so it always resolved to its 'system'
// fallback. Rather than leave an unused dependency and a
// toggle-that-isn't (U3 in the audit), just match the app's actual theme
// directly. If a real toggle gets built later, swap this back for
// next-themes' ThemeProvider/useTheme.
const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      theme="light"
      className="toaster group"
      toastOptions={{
        classNames: {
          toast:
            'group toast group-[.toaster]:bg-background group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg',
          description: 'group-[.toast]:text-muted-foreground',
          actionButton:
            'group-[.toast]:bg-primary group-[.toast]:text-primary-foreground',
          cancelButton:
            'group-[.toast]:bg-muted group-[.toast]:text-muted-foreground',
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
