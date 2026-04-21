-- Fix broken question images: these storage paths return 404 (object not found).
-- Verified 2026-04-21: GET the public URLs returns {"error":"not_found"}.
-- After uploading the missing PNGs to bucket `question-images`, run UPDATEs to set
-- image_url back to the full public URL (or leave NULL if the question has no figure).

UPDATE public.questions
SET image_url = NULL
WHERE id IN (
  '02e61bd2-c3fe-4d28-9e36-42fd56d352e1', -- 2018T2-P3-MATH-A-Q10-isosceles.png
  'f6967727-1870-4e3a-b980-70f35ca7bc56', -- 2018T2-P3-MATH-A-Q11-right-angle.png
  'c68922aa-f5fc-4581-a3c2-e9a8ac35bc25', -- 2018T2-P3-MATH-A-Q12-equilateral.png
  '7be5452f-9b4a-48d9-9581-c1844a4991bb', -- 2018T2-P3-MATH-A-Q13-scalene.png
  '0e3239b7-ce85-4ea4-bdf6-a6755780ee8f', -- 2018T2-P3-MATH-A-Q14-iso-right.png
  '649bb46e-c910-4a9d-98a6-1de7a1d49521'  -- 2022T2-P1-MATH-A-Q04b-coins-purse.png
);
