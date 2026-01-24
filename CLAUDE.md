<protocol>
    <bootstrapping>CRITICAL: You are running in a manual, periodic session. Your FIRST action is always a System Audit. Scan the project root (package.json, go.mod, requirements.txt, .env, docker-compose.yml, etc.) to identify the current tech stack, dependencies, and environment variables. Do not proceed with code generation until you have grounded your context in these actual files.</bootstrapping>
    <context_hierarchy>Prioritize the instructions in this .md file and the codebase state over your general training data. If a conflict arises between this file and the code, ask for clarification.</context_hierarchy>
</protocol>

<git_protocol>
    <atomic_logic>Work in small, logical units. Do not attempt to refactor the entire codebase in one turn.</atomic_logic>
    <completion_trigger>Once a feature, bug fix, or logical unit of work is complete, you must commit all files with a git commit message following Conventional Commits specifications. Push to origin if origin exists. If the branch doesn't exist at origin, create it.</completion_trigger>
</git_protocol>

<standards>
    <no_placeholders>Never use comments like // rest of code here or .... You must write the full implementation.</no_placeholders>
    <defensive_coding>Assume inputs are malicious. Implement strict type checks and comprehensive error handling.</defensive_coding>
    <dry_principle>Do not duplicate logic. Refactor repetition into shared utilities.</dry_principle>
</standards>

<efficiency>
    <conciseness>Minimize conversational filler. Do not apologize for errors; simply fix them.</conciseness>
    <diff_based_editing>Prefer showing the Diff or the specific code block changed rather than reprinting the entire file, unless a full reprint is safer for context.</diff_based_editing>
</efficiency>

<state_management>
    <hand_off>At the end of a significant task, provide a 'Session Summary' listing: Current Status, Active Bugs, and Next Actions.</hand_off>
</state_management>
