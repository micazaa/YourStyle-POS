# Inventory image upload folder

The user selected Drive folder `1pu8oqKhPsgNfc4CyCsNHBDwpCUYrnMNY`, verified as the native Drive folder **INVENTORY**, for new inventory image saves. The only deployed source edit changes `PHASE8_PRODUCT_IMAGES_FOLDER_ID` in `Backend/InventoryMovement.js` from `1Jm-OdXcmg17KgHW5Ed_NRwwTKvrbpWC3` to the selected folder.

Normal inventory and Product Master uploads call `createInventoryImage_`; the existing catalog-image maintenance function also uses this shared setting. Existing image URLs, thumbnail behavior, image limits and permissions remain unchanged. No existing images were moved, no catalog generation was run, and neither sheet's schema or records were edited. Production code remains on version 21 under the user's dev-only instruction.

Upload routing was exercised against the exact staged server helper with a Drive mock. Lint, project validation, formatting and whitespace checks passed. The corrected staged release was compared to the remote dev version 46 snapshot and proved to change exactly one folder ID in one source file; all other source files were preserved. Immutable source readback and active deployment verification are recorded under `/private/tmp/yourstyle-inventory-folder-release`.

Release correction: the first dev package (version 47) inadvertently included unrelated local inventory edits. It was reverted to the original version 46 deployment and HEAD. The corrected release is built from the remote snapshot with only the folder setting replaced; unrelated local edits remain in the working tree for their own task. Production sources and deployments were unchanged during both releases. No live image upload or inventory data edit was performed as part of verification.

The corrected release is active on **dev version 48**. All 67 immutable source files match the staged package. Production source hashes and deployment records match the original snapshot; live production remains **version 21**.
