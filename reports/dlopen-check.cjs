const p = 'D:\\hackathon\\cashcue\\node_modules\\@next\\swc-win32-x64-msvc\\next-swc.win32-x64-msvc.node';
try { process.dlopen({ exports: {} }, p); console.log('DLOPEN_OK'); }
catch (e) { console.log('DLOPEN_ERR', e.code, e.message); }
