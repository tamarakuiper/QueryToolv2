import React from 'react'
export function Select({ className = '', children, ...props }) {
    return <select className={`field ${className}`} {...props}>{children}</select>
}
