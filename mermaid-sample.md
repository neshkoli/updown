# Mermaid Diagrams Sample

This file demonstrates Mermaid diagram support in UpDown.

---

## Flowchart

```mermaid
flowchart TD
    A[Start] --> B{Is it working?}
    B -- Yes --> C[Great!]
    B -- No --> D[Debug]
    D --> B
    C --> E[End]
```

---

## Sequence Diagram

```mermaid
sequenceDiagram
    participant User
    participant App
    participant Renderer

    User->>App: Opens markdown file
    App->>Renderer: Parse & render
    Renderer-->>App: HTML output
    App-->>User: Show preview
```

---

## Class Diagram

```mermaid
classDiagram
    class Editor {
        +String content
        +open(path)
        +save(path)
    }
    class Renderer {
        +render(markdown) String
    }
    class Preview {
        +update(html)
    }

    Editor --> Renderer : uses
    Renderer --> Preview : updates
```

---

## Pie Chart

```mermaid
pie title File Types
    "Markdown" : 60
    "JavaScript" : 25
    "CSS" : 10
    "Other" : 5
```

---

## Git Graph

```mermaid
gitGraph
    commit id: "init"
    commit id: "add markdown-it"
    branch feature/mermaid
    checkout feature/mermaid
    commit id: "add mermaid support"
    commit id: "add sample file"
    checkout main
    merge feature/mermaid id: "merge mermaid"
    commit id: "release v2.1"
```

---

## State Diagram

```mermaid
stateDiagram-v2
    [*] --> Idle
    Idle --> Editing : open file
    Editing --> Saving : Cmd+S
    Saving --> Editing : saved
    Editing --> Idle : close file
    Idle --> [*]
```
