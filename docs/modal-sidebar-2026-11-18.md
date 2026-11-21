# Modal sidebar visibility fix

The shared Retail stylesheet explicitly applied `visibility:hidden` to the sidebar, sidebar backdrop and mobile workspace bar whenever `ys-dialog-open` was active. Opening account preview or another shared modal therefore removed the navigation chrome from view.

Removed that single CSS rule. Normal signed-in/sidebar visibility rules now apply behind modal backdrops. Scroll locking, modal stacking and keyboard focus handling remain in place. No sheet, data or permission changes were made.

All six focused retail UI checks, lint, project validation, formatting and whitespace checks passed. The staged package was compared against the remote dev version 49 snapshot and verified to remove exactly that one rule in one file. All 67 immutable source files matched the staged release before activation.

Released on **dev version 50**, verified active. Production source hashes and deployment records are unchanged; production remains **version 21**. Deployment evidence is under `/private/tmp/yourstyle-modal-sidebar-release`. Browser screenshot verification was not performed.
