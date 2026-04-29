"use client";

import { useEffect, useRef } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import "@xterm/xterm/css/xterm.css";
import { useWebContainer } from "../context/webcontainer-context";

export const TerminalPanel = () => {
    const terminalRef = useRef<HTMLDivElement>(null);
    // Gate on filesReady (not just webcontainer) so the shell only starts
    // after instance.mount() has completed. Without this, on page refresh
    // the webcontainer ref exists immediately (module-scope singleton) but
    // the filesystem isn't mounted yet — "cd / && ls" shows an empty root.
    const { webcontainer, filesReady } = useWebContainer();

    useEffect(() => {
        if (!terminalRef.current || !webcontainer || !filesReady) return;

        // Praxiom — terminal theme matches surface-0 (deepest), silver-bright fg, indigo cursor.
        // Hardcoded values are required because xterm config doesn't accept CSS variables.
        const terminal = new Terminal({
            cursorBlink: true,
            convertEol: true,
            theme: {
                background: "#0a0a0a",       // surface-0 dark (hsl(0 0% 4%))
                foreground: "#d1d1d1",       // silver (hsl(0 0% 82%))
                cursor: "#5c6bff",            // primary / electric indigo
                selectionBackground: "#1f1f1f", // surface-3 (hsl(0 0% 12%))
                black: "#0a0a0a",
                brightBlack: "#404040",
                white: "#d1d1d1",
                brightWhite: "#f2f2f2",
            },
            fontSize: 13,
            // Praxiom §3.1 — JetBrains Mono is the official mono font
            fontFamily: "var(--font-jetbrains-mono), 'JetBrains Mono', Menlo, Monaco, 'Courier New', monospace",
        });

        const fitAddon = new FitAddon();
        const webLinksAddon = new WebLinksAddon();

        terminal.loadAddon(fitAddon);
        terminal.loadAddon(webLinksAddon);
        terminal.open(terminalRef.current);
        fitAddon.fit();

        // Start shell
        let shellProcess: any = null;

        const startShell = async () => {
            // CRITICAL: do NOT set HOME=/. That pollutes the project root with
            // npm cache dirs (`.npm/_locks`, `.npm/_logs`) which then conflict
            // with our mounted files and corrupt npm state. Let HOME default.
            const shell = await webcontainer.spawn("jsh", {
                terminal: {
                    cols: terminal.cols,
                    rows: terminal.rows,
                },
                env: { TERM: "xterm-256color" },
            });

            shellProcess = shell;

            // Pipe shell output to terminal
            shell.output.pipeTo(
                new WritableStream({
                    write(data) {
                        terminal.write(data);
                    },
                })
            );

            // Pipe terminal input to shell
            const input = shell.input.getWriter();
            terminal.onData((data) => {
                input.write(data);
            });

            // Navigate to the project root and list files so the user can
            // see what's there. Install + dev are handled programmatically
            // by WebContainerProvider's auto-boot pipeline — the terminal
            // is purely interactive (for ad-hoc commands, edits, etc.).
            await new Promise<void>((resolve) => setTimeout(resolve, 300));
            input.write("cd / && ls\n");

            return shell;
        };

        startShell();

        // Handle Resize
        const handleResize = () => {
            fitAddon.fit();
            shellProcess?.resize({
                cols: terminal.cols,
                rows: terminal.rows,
            });
        };

        window.addEventListener("resize", handleResize);

        return () => {
            window.removeEventListener("resize", handleResize);
            terminal.dispose();
            // shellProcess?.kill(); // xterm dispose handles UI, process cleanup is tricky here without strict lifecycle
        };
    }, [webcontainer, filesReady]);

    // Wrapper bg matches xterm theme.background so there's no flash before init
    return <div ref={terminalRef} className="h-full w-full bg-surface-0 px-2 pt-1" />;
};
