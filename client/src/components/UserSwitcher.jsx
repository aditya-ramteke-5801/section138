import React, { useState } from 'react';
import {
  Avatar, Box, Typography, Popover, List, ListItemButton,
  ListItemAvatar, ListItemText, Divider,
} from '@mui/material';
import CheckIcon from '@mui/icons-material/Check';

const USERS = [
  {
    role: 'legal_ops',
    name: 'Legal Operations',
    subtitle: 'Create & manage campaigns',
    initials: 'LO',
    color: '#675AF9',
  },
  {
    role: 'lawyer',
    name: 'Unnati Vashisth',
    subtitle: 'Advocate — Review & sign notices',
    initials: 'UV',
    color: '#E91E63',
  },
];

export default function UserSwitcher({ userRole, onRoleChange }) {
  const [anchorEl, setAnchorEl] = useState(null);
  const open = Boolean(anchorEl);

  const activeUser = USERS.find(u => u.role === userRole) || USERS[0];

  return (
    <>
      <Avatar
        onClick={(e) => setAnchorEl(e.currentTarget)}
        sx={{
          width: 36, height: 36,
          bgcolor: activeUser.color,
          cursor: 'pointer',
          fontSize: '0.85rem',
          fontWeight: 700,
          '&:hover': { boxShadow: '0 0 0 3px rgba(255,255,255,0.3)' },
        }}
      >
        {activeUser.initials}
      </Avatar>

      <Popover
        open={open}
        anchorEl={anchorEl}
        onClose={() => setAnchorEl(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        slotProps={{
          paper: {
            sx: { width: 300, borderRadius: 3, mt: 1, overflow: 'hidden' },
          },
        }}
      >
        <Box sx={{ px: 2.5, py: 2, bgcolor: '#F7F7FB' }}>
          <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>
            Switch account
          </Typography>
        </Box>
        <Divider />
        <List disablePadding>
          {USERS.map((user) => (
            <ListItemButton
              key={user.role}
              selected={user.role === userRole}
              onClick={() => {
                onRoleChange(user.role);
                setAnchorEl(null);
              }}
              sx={{
                py: 1.5, px: 2.5,
                '&.Mui-selected': { bgcolor: '#F0EEFE' },
              }}
            >
              <ListItemAvatar sx={{ minWidth: 44 }}>
                <Avatar sx={{ width: 34, height: 34, bgcolor: user.color, fontSize: '0.8rem', fontWeight: 700 }}>
                  {user.initials}
                </Avatar>
              </ListItemAvatar>
              <ListItemText
                primary={user.name}
                secondary={user.subtitle}
                primaryTypographyProps={{ variant: 'body2', fontWeight: 600 }}
                secondaryTypographyProps={{ variant: 'caption' }}
              />
              {user.role === userRole && (
                <CheckIcon fontSize="small" color="primary" />
              )}
            </ListItemButton>
          ))}
        </List>
      </Popover>
    </>
  );
}
