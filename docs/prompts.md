# 1

so just to clarify and correct you a little - we have 5 steps

1. a trigger which gets activated after the pdf is added in bucket
2. IndexPdfLambda lmabda which downloads the pdfs and extracts text ONLY
3. Second lambda first creates a s3 vecotr bucket, then does this in loop:
   3.1 chunks the extracted text into fixed sized
   3.2 vectorizes it using bedrock
   3.3 pushes them into bucket

- we need to select how to store metadata --> but before selecting also tell me - you said that raw text can be stored as metadata but it is very limited - how small are we talking

4. QueryRagLambda

   - it ONLY recieves query string in natural language
   - it vectorizes it using the same bedrock model earlier used
   - it then initiates the search in the s3 vectors bucket and calculates the cosine similarity returns the top k vectors
   - BASED ON WHAT WE CHOSE FOR STEP 3 - we retrieve the metadata for those k chunks, which is ONLY THE RAW TEXT (nothing else)
   - these raw texts and the actual question should be stored and given to the next lambda
5. this lambda is responsible for folling things:

   - INPUT: json of actual question, raw texts of all top k vectors
   - TASKS:
     - create a prompt and a gemini client and tell it to answer this
     - parse the response correctly from gemini and log it

---

<Task>

1. Check everything
2. need metdata clarification for step 3

</Task>

just to inform you that I did the decoupling of second lambda into query lambda and gemini lambda bcoz later for the actual application we would need to add a few more things in lamda which might be overloading a single lambda

# 2

I AM NEW TO AWS and dont know anything about it - JUST CREATED AN AWS account -->  I have completed Phase 1 and 2 of this plan and attached its documentation below

Lets start with the PHASE 3 of implementation -->

---

<ADMIN_COMMANDS>

- For a phase give me tasks so that the advancement is more manageable
- For every task: give a few cases which I need to check and inform you the results before we move to the next task
- Give ultra_detailed navigation instructions accross AWS console for every task and help me understand why we are doing what we are doing

</ADMIN_COMMANDS>



<phase1_report>
fill in .....
</phase1_report>

<phase2_report>
fill in .....
</phase2_report>

<phase3_details>
fill in from @plan.md .....
</phase3_details>
