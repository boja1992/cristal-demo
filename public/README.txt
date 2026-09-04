BRACELET VIEWER
================

A 3D viewer for the bracelet model. Runs entirely in your browser -
nothing here gets uploaded anywhere.

Requires Node.js. Check with:  node -v
Don't have it? Install the LTS version from https://nodejs.org


HOW TO RUN
----------

1. Open a terminal in this folder:

     WINDOWS
     a. Open this folder in File Explorer.
     b. Click once on the empty area of the address bar at the top
        (the strip showing the folder path). It turns into an
        editable text box.
     c. Type: cmd
     d. Press Enter. A black Command Prompt window opens, already
        set to this folder.

     (Alternative: hold Shift, right-click empty space inside the
     folder, choose "Open PowerShell window here" or "Open in
     Terminal".)

     MAC
     a. Open this folder in Finder.
     b. Right-click (or Control-click) empty space inside it.
     c. Choose "New Terminal at Folder".
     (If that option is missing: open Terminal normally, type
     "cd " with a trailing space, then drag this folder into the
     Terminal window to fill in the path, then press Enter.)

2. In that terminal, run:
     npx serve

   (first run may ask to install "serve" - type y)

3. Open the URL it prints (usually http://localhost:3000)

To stop: go back to the terminal and press Ctrl+C.


NOTE
----
Double-clicking index.html directly will NOT work - browsers block it.
It must be served as above.
