import {open,unlink} from 'node:fs/promises';

export async function writePageArchive(path:string,bytes:Buffer,assertCurrent:()=>void):Promise<void> {
  let created=false;
  try {
    assertCurrent();
    let file;
    try {
      file=await open(path,'wx',0o600);created=true;
      await file.writeFile(bytes);await file.sync();
    }catch(error){throw new Error((error as NodeJS.ErrnoException).code==='EEXIST'?'A file already exists at that location. Choose a new filename.':'The page archive could not be written. Choose a writable location and retry.');}
    finally{try{await file?.close();}catch{throw new Error('The page archive could not be closed safely. Retry saving to a new file.');}}
    assertCurrent();
  }catch(error){
    if(created)try{await unlink(path);}catch{throw new Error('Page archive cleanup could not finish. Review the file you selected.');}
    throw error;
  }
}
