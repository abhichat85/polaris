"use client";

import { useEffect, useRef } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import "@xterm/xterm/css/xterm.css";
import { useWebContainer } from "../context/webcontainer-context";

export const TerminalPanel = () => {
    const terminalRef = useRef<HTMLDivElement>(null);
    const { webcontainer } = useWebContainer();

    useEffect(() => {
        if (!terminalRef.current || !webcontainer) return;

        // Initialize xterm
        const terminal = new Terminal({
            cursorBlink: true,
            convertEol: true,
            theme: {
                background: "#1e1e1e",
                foreground: "#d4d4d4",
            },
            fontSize: 14,
            fontFamily: "Menlo, Monaco, 'Courier New', monospace",
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
            const shell = await webcontainer.spawn("jsh", {
                terminal: {
                    cols: terminal.cols,
                    rows: terminal.rows,
                },
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
    }, [webcontainer]);

    return <div ref={terminalRef} className="h-full w-full bg-[#1e1e1e]" />;
};
