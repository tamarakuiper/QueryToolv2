import React from 'react'
export function Table({ children }) { return <table className="min-w-full text-sm">{children}</table> }
export function THead({ children }) { return <thead className="bg-muted/50">{children}</thead> }
export function TRow({ children, zebra }) { return <tr className={zebra ? 'odd:bg-white even:bg-muted/30' : ''}>{children}</tr> }
export function TH({ children }) { return <th className="text-left p-3 border-b">{children}</th> }
export function TD({ children }) { return <td className="p-3 border-b">{children}</td> }
