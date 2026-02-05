"use client";

import * as React from "react";
import CodeMirror from "@uiw/react-codemirror";
import { markdown } from "@codemirror/lang-markdown";
import { languages } from "@codemirror/language-data";
import { vscodeDark, vscodeLight } from "@uiw/codemirror-theme-vscode";
import { useTheme } from "next-themes";

import { cn } from "@/lib/utils";

export function MdEditor({
  value,
  onChange,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  className?: string;
}) {
  const { resolvedTheme } = useTheme();

  return (
    <div className={cn("h-full", className)}>
      <CodeMirror
        value={value}
        height="100%"
        theme={resolvedTheme === "dark" ? vscodeDark : vscodeLight}
        basicSetup={{
          lineNumbers: true,
          foldGutter: true,
          highlightActiveLine: true,
          highlightActiveLineGutter: true,
          bracketMatching: true,
        }}
        extensions={[markdown({ codeLanguages: languages })]}
        onChange={onChange}
      />
    </div>
  );
}

