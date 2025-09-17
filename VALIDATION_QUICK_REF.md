# Task Validation Quick Reference

## ❌ Validation Errors (Will Block Task Creation)

| Rule | ❌ Don't | ✅ Do |
|------|---------|-------|
| **No IDs in titles** | "Fix task #123" | "Fix authentication bug" |
| **No progress in descriptions** | "I completed the OAuth..." | "Implement OAuth2 authentication..." |
| **Specific titles** | "Fix", "Update thing" | "Fix login validation bug" |
| **Granular tasks** | "Fix all bugs" | "Fix memory leak in user sessions" |

## ⚠️ Validation Warnings (Recommended Fixes)

| Rule | ⚠️ Warning | ✅ Better |
|------|-----------|---------|
| **Project field usage** | Title: "Fix user-auth bug"<br>Project: (empty) | Title: "Fix authentication bug"<br>Project: "user-auth" |
| **Description length** | 500+ word descriptions | Concise, focused descriptions |

## 📋 Task Template

```json
{
  "title": "Specific action + component/area",
  "description": "What needs to be done and why", 
  "category": "bug-fix|feature|documentation|testing",
  "project": "project-name",
  "priority": 1-5,
  "tags": "comma, separated, keywords"
}
```

## 🔄 For Progress Updates

- ❌ Update task descriptions with progress
- ✅ Use `complete_task()` when done
- ✅ Use `store_memory()` for progress notes

## 🚀 Quick Fix Patterns

**ID in title**: Remove "#123", "task 456", "id #789"  
**Progress language**: Remove "completed", "done", "working successfully"  
**Vague titles**: Add specific component/area details  
**Broad scope**: Split into individual deliverables  
**Project info**: Move to project field from title
