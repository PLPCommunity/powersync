# Public Access Guide

## New Public Access Approach

The public access system has been simplified to use the normal board URL instead of generating separate public links.

## How It Works

### Before (Old System)

- Public boards had separate URLs like `/board/public/abc123`
- Generated unique `linkId` for each public board
- Required separate routing logic

### After (New System)

- Public boards use the normal URL: `/board/:id`
- No separate `linkId` generation
- Same route handles both public and private access
- Backend automatically detects public access and handles permissions

## Benefits

1. **Simpler URLs**: Public boards use the same URL format as private boards
2. **Easier Sharing**: Just share the normal board link
3. **Better UX**: No confusion about different link types
4. **Cleaner Code**: Single route handles all board access

## How to Use

### For Board Owners

1. Open any board
2. Click "Share" button
3. Enable "Public access" checkbox
4. Choose role: "Viewer" or "Editor"
5. Copy the board link (e.g., `https://yoursite.com/board/abc123`)
6. Share the link with anyone

### For Viewers

1. Click the shared board link
2. If the board is public, it will load immediately
3. If the board is private, you'll be prompted to sign in
4. View or edit based on the public access role

## Technical Details

### Backend Changes

- Removed `linkId` field from Board schema
- Updated main board route (`GET /:id`) to handle public access
- Public boards return limited data (no owner/collaborator info)
- Private boards still require authentication

### Frontend Changes

- Removed separate public route (`/board/public/:linkId`)
- Single `BoardCanvas` component handles all boards
- Component detects public access from board data
- Share modal shows normal board link for public access

### Database Changes

- `publicAccess.linkId` field removed
- `publicAccess.enabled` and `publicAccess.role` remain
- Existing public boards will continue to work

## Testing

### Test Public Access

1. Create a board and enable public access
2. Copy the board link
3. Open in incognito/private browser
4. Verify the board loads without authentication

### Test Private Access

1. Create a board (public access disabled)
2. Copy the board link
3. Open in incognito/private browser
4. Verify you're redirected to login

### Debug Endpoints

- `GET /api/test/public-boards` - List all public boards
- `GET /api/test/boards-count` - Board statistics

## Migration Notes

- Existing public boards with `linkId` will continue to work
- The `linkId` field is no longer used but won't break existing functionality
- Users can still access public boards via the old public links (if they exist)
- New public boards will use the simplified approach

## Security

- Public boards are accessible to anyone with the link
- No authentication required for public boards
- Public boards return limited data (no sensitive information)
- Private boards still require proper authentication
- Role-based permissions still apply (viewer vs editor)
