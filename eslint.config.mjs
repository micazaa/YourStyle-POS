export default [
  {
    ignores: [
      "node_modules/**",
      ".git/**",
      "dist/**",
      "build/**"
    ]
  },

  {
    files: ["Backend/**/*.js", "**/*.gs"],

    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "script",

      globals: {
        // Google Apps Script services
        SpreadsheetApp: "readonly",
        DriveApp: "readonly",
        HtmlService: "readonly",
        Utilities: "readonly",
        Logger: "readonly",
        Session: "readonly",
        PropertiesService: "readonly",
        ScriptApp: "readonly",
        LockService: "readonly",
        UrlFetchApp: "readonly",
        GmailApp: "readonly",
        MailApp: "readonly",
        ContentService: "readonly",
        CacheService: "readonly",
        FormApp: "readonly",
        DocumentApp: "readonly",
        SlidesApp: "readonly",
        CalendarApp: "readonly",
        ContactsApp: "readonly",
        LanguageApp: "readonly",
        Maps: "readonly",
        Charts: "readonly",
        Jdbc: "readonly",
        Browser: "readonly",
        console: "readonly"
      }
    },

    rules: {
      /*
       * IMPORTANT:
       * Apps Script backend files share one global namespace.
       * ESLint analyzes these files separately and therefore cannot
       * reliably determine cross-file globals.
       *
       * We temporarily disable no-undef rather than polluting this
       * config with hundreds of YS POS function/constant names.
       */
      "no-undef": "off",

      /*
       * Apps Script exposes many top-level functions to:
       * - google.script.run
       * - Apps Script execution
       * - triggers
       * - other .gs files
       *
       * Therefore "defined but never used in this file" is frequently
       * a false positive.
       */
      "no-unused-vars": "off",

      // These remain useful real static checks.
      "no-unreachable": "error",
      "no-redeclare": "error",
      "no-dupe-keys": "error",
      "no-func-assign": "error",
      "no-self-assign": "error"
    }
  }
];