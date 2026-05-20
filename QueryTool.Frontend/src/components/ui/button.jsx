import React from 'react'
export function Button({ variant='default', className='', ...props }){
  const base = 'btn'
  const v = variant === 'ghost' ? 'btn-ghost'
    : variant === 'outline' ? 'btn-outline'
    : 'btn-primary'
  return <button className={`${base} ${v} ${className}`} {...props} />
}
