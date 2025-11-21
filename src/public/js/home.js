function init() {
    const tokenName = localStorage.getItem('ziplai_token_name');
    if (tokenName && localStorage.getItem(tokenName)) {
        const res = fetch('/api/validate/token', {
            method: 'POST',
            headers: { 'Authorization': localStorage.getItem(tokenName) },
        }).then((res) => {
            if (!res.ok) {
                console.log("tokenName, ", tokenName);
                console.log("localStorage.getItem(tokenName), ", localStorage.getItem(tokenName));

                localStorage.removeItem(tokenName);
                localStorage.removeItem('ziplai_token_name');
                window.location.href = '/login';
                return;
            }
        });
    }
    else {
        window.location.href = '/login';
        return;
    }

    const creditsCount = document.getElementById('credits-count');
    const filenameBox = document.getElementById('file-name');
    let usingSavedData = false;
    const resumeText = document.getElementById('resumeText');
    const userEmailContainer = document.getElementById('user-email');
    let gatewayCustomerId;
    let creditsPolling;
    let currentCredits = 0;

    const getMyDetails = (projection = {}) => {
        fetch(`/api/me${projection.only_credits ? '?only_credits=' + projection.only_credits : ''}`, {
            method: 'GET',
            headers: { 'Authorization': localStorage.getItem(tokenName) },
        }).then(async (res) => {
            if (res.ok) {
                const data = await res.json();
                
                if((creditsPolling && currentCredits < parseInt(data.credits)) || !creditsPolling) {
                    creditsCount.textContent = data.credits;
                    currentCredits = data.credits;

                    if(creditsPolling) {
                        showToast();
                        clearInterval(creditsPolling);
                        creditsPolling = undefined;
                    }
                }

                if(!projection || !projection.only_credits) {
                    userEmailContainer.textContent = data.email || 'No email';
                    gatewayCustomerId = data.gateway_customer_id;

                    if (data.saved_resume_file) {
                        const originalFilename = data.saved_resume_file.original_name;
                        if (originalFilename) {
                            filenameBox.textContent = originalFilename;
                            document.getElementById('fileInfo').textContent = `${originalFilename} • Saved from last session`;
                            usingSavedData = true;
                        }
                    }
                    else if (data.saved_resume_text) {
                        resumeText.value = data.saved_resume_text;
                    }
                    else {

                    }
                }
            }
        });
    }

    getMyDetails();

    const extractTextFromPDF = async (file) => {
        const pdfjsLib = window['pdfjs-dist/build/pdf'];
        pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        let fullText = '';

        for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
            const page = await pdf.getPage(pageNum);
            const textContent = await page.getTextContent();

            // Sort items top-to-bottom, left-to-right (important for multi-column PDFs)
            const items = textContent.items.sort((a, b) => {
                const yDiff = b.transform[5] - a.transform[5]; // higher y is upper text
                if (Math.abs(yDiff) > 2) return yDiff; // different lines
                return a.transform[4] - b.transform[4]; // same line, sort by x
            });

            let pageText = '';
            let lastY = null;

            for (const item of items) {
                const y = item.transform[5];

                // Add a line break when Y position changes significantly
                if (lastY !== null && Math.abs(lastY - y) > 5) {
                    pageText += '\n';
                }

                pageText += item.str + ' ';
                lastY = y;
            }

            fullText += pageText.trim() + '\n\n';
        }

        return fullText.trim();
    };

    // Client-side behavior
    const clearFile = document.getElementById('clearFile');
    const fileInfo = document.getElementById('fileInfo');
    const jobDesc = document.getElementById('jobDesc');
    const generateBtn = document.getElementById('generateBtn');
    // const regenBtn = document.getElementById('regenBtn');
    const statusNote = document.getElementById('statusNote');
    const errorBox = document.getElementById('errorBox');
    const coverLetterEl = document.getElementById('coverLetter');
    const linkedinEl = document.getElementById('linkedinMsg');
    const authTokenEl = document.getElementById('authToken');
    const chooseFileButton = document.getElementById('choose-file-button');
    const resumeFile = document.getElementById('resumeFile');

    const copyCover = document.getElementById('copyCover');
    const copyLinkedin = document.getElementById('copyLinkedin');
    const downloadCover = document.getElementById('downloadCover');
    const downloadLinkedin = document.getElementById('downloadLinkedin');
    const genLoader = document.getElementById('gen-loader');
    const genList = document.getElementById('gen-list');

    const addCreditsBtn = document.getElementById('add-credits-btn');
    const creditsModal = document.getElementById('credits-modal'); // ensure modal HTML exists
    const closeAddCreditsBtn = document.getElementById('close-credits-modal');
    const buyCreditsBtn = document.getElementById('buy-credits-btn');

    const logoutBtn = document.getElementById('logout-btn');
    const greyLoader = document.getElementById('grey-loader-overlay');

    const MAX_PDF_BYTES = 10 * 1024 * 1024; // 10 MB
    const MAX_RESUME_CHARS = 6000;
    const MAX_JOB_CHARS = 5000;

    let lastPayload = null;

    chooseFileButton.addEventListener('click', () => {
        resumeFile.click();
    });

    resumeFile.addEventListener('change', () => {
        usingSavedData = false;
        errorBox.style.display = 'none';
        const f = resumeFile.files[0];
        if (!f) {
            fileInfo.textContent = 'No file selected • Max size: 10 MB';
            filenameBox.textContent = 'No file chosen';
            return;
        }
        console.log(f.type);

        if (!['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'].includes(f.type)) {
            fileInfo.textContent = 'Invalid file type. Only PDF and DOCX allowed.';
            resumeFile.value = '';
            return;
        }
        if (f.size > MAX_PDF_BYTES) {
            fileInfo.textContent = 'File too large. Max 10 MB.';
            resumeFile.value = '';
            return;
        }
        fileInfo.textContent = `${f.name} • ${(f.size / 1024).toFixed(1)} KB`;
        filenameBox.textContent = f.name;

        // Auto-extract text from PDF and fill resumeText
        // extractTextFromPDF(f).then(text => {
        //   if (text.length > MAX_RESUME_CHARS) {
        //     showError('Extracted resume text exceeds 6000 characters. Please paste manually or use a smaller PDF.');
        //     resumeText.value = '';
        //   } else {
        //     resumeText.value = text;
        //     clearError();
        //   }
        // }).catch(err => {
        //   console.error(err);
        //   showError('Failed to extract text from PDF. Please paste resume text manually.');
        //   resumeText.value = '';
        // });
    });

    clearFile.addEventListener('click', () => {
        resumeFile.value = '';
        fileInfo.textContent = 'No file selected • Max size: 10 MB';
        filenameBox.textContent = 'No file chosen';
        usingSavedData = false;
    });

    function showError(msg) {
        errorBox.style.display = 'block';
        errorBox.textContent = msg;
    }

    function clearError() { errorBox.style.display = 'none'; errorBox.textContent = '' }

    function setLoading(loading) {
        if (loading) {
            generateBtn.classList.add('disabled');
            statusNote.textContent = 'Generating...';
        } else {
            generateBtn.classList.remove('disabled');
            statusNote.textContent = 'Ready';
        }
    }

    async function postGenerate() {
        clearError();

        const file = resumeFile.files[0];
        const resume_val = resumeText.value.trim();
        const job_val = jobDesc.value.trim();
        const token = localStorage.getItem(tokenName);

        // Client-side validation
        // if (!file && !resume_val) { showError('Please upload a PDF resume or paste your resume text.'); return }
        // if (!job_val) { showError('Please paste the job description.'); return }
        // if (resume_val.length > MAX_RESUME_CHARS) { showError('Resume text exceeds 6000 characters.'); return }
        // if (job_val.length > MAX_JOB_CHARS) { showError('Job description exceeds 5000 characters.'); return }
        // if (file && file.size > MAX_PDF_BYTES) { showError('Uploaded PDF exceeds 10 MB.'); return }

        setLoading(true);
        showOverlayLoader();

        const form = new FormData();
        if (!usingSavedData) {
            if (file) form.append('resume_file', file);
            else form.append('resume_text', resume_val);
        }
        else {
            form.append('use_saved_resume', true);
        }

        form.append('job_description', job_val);

        try {
            const res = await fetch('/api/generate', {
                method: 'POST',
                headers: token ? { 'Authorization': token } : {},
                body: form
            });

            if (!res.ok) {
                const t = await res.text();
                throw new Error(`Server error: ${res.status} ${t}`);
            }

            const json = await res.json();

            // Expecting { coverLetter: string, recruiterMessage: string }
            const coverLetter = json.cover_letter || '';
            const recruiterMessage = json.recruiter_message || '';

            coverLetterEl.textContent = coverLetter || '—';
            linkedinEl.textContent = recruiterMessage || '—';

            document.getElementById('result_card_placeholder').style.display = 'none';
            document.getElementById('result_card').style.display = 'block';

            creditsCount.textContent = json.remaining_credits || creditsCount.textContent;

            lastPayload = { resumeFile: !!file, resume_text: resume_val, job_description: job_val };
            // regenBtn.disabled = false;
        } catch (err) {
            console.error(err);
            showError(err.message);
        } finally {
            setLoading(false);
            hideOverlayLoader();
        }
    }

    async function postGenerateStream() {
        clearError();

        const file = resumeFile.files[0];
        const resume_val = resumeText.value.trim();
        const job_val = jobDesc.value.trim();
        const token = localStorage.getItem(tokenName);

        // Client-side validation
        // if (!file && !resume_val) { showError('Please upload a PDF resume or paste your resume text.'); return }
        // if (!job_val) { showError('Please paste the job description.'); return }
        // if (resume_val.length > MAX_RESUME_CHARS) { showError('Resume text exceeds 6000 characters.'); return }
        // if (job_val.length > MAX_JOB_CHARS) { showError('Job description exceeds 5000 characters.'); return }
        // if (file && file.size > MAX_PDF_BYTES) { showError('Uploaded PDF exceeds 10 MB.'); return }

        setLoading(true);
        showOverlayLoader();

        const form = new FormData();
        if (file) form.append('resume_file', file);
        else form.append('resume_text', resume_val);
        form.append('job_description', job_val);

        try {
            const res = await fetch('/api/generate', {
                method: 'POST',
                headers: token ? { 'Authorization': token } : {},
                body: form
            });

            hideOverlayLoader();
            document.getElementById('result_card_placeholder').style.display = 'none';
            document.getElementById('result_card').style.display = 'block';

            const reader = res.body.getReader();
            const decoder = new TextDecoder("utf-8");

            let fullText = "";
            let currentSection = null;

            const sections = {
                COVER_LETTER: coverLetterEl,
                LINKEDIN_MESSAGE: linkedinEl
            };

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                const chunk = decoder.decode(value, { stream: true });
                const lines = chunk.split("\n\n");

                console.log("\n\nLine: ", lines);


                for (const line of lines) {
                    if (!line.startsWith("data: ")) continue;
                    const data = line.slice(6).trim();
                    if (data === "[DONE]") {
                        setLoading(false);
                        return;
                    }

                    try {
                        const { responseToken, USER_REMAINING_CREDITS } = JSON.parse(data);
                        if (!responseToken && !USER_REMAINING_CREDITS) continue;

                        if (USER_REMAINING_CREDITS) {
                            creditsCount.textContent = USER_REMAINING_CREDITS;
                            continue;
                        }

                        fullText += responseToken;

                        // Detect which section we’re in
                        if (fullText.match(/COVER_LETTER:/i)) currentSection = "COVER_LETTER";
                        if (fullText.match(/LINKEDIN_MESSAGE:/i)) currentSection = "LINKEDIN_MESSAGE";
                        if (fullText.match(/JOB_TITLE:/i)) currentSection = "JOB_TITLE";

                        // Append responseToken to appropriate section
                        if (currentSection && sections[currentSection]) {
                            // Avoid writing section labels
                            if (!responseToken.match(/COVER_LETTER:|LINKEDIN_MESSAGE:|JOB_TITLE:/i)) {
                                console.log("\n\nResponse Token: ", responseToken);

                                sections[currentSection].textContent += responseToken;
                            }
                        }
                    } catch (error) {
                        console.log("Error parsing tokens: ", error);

                    }
                }
            }

            const coverLetter = json.cover_letter || '';
            const recruiterMessage = json.recruiter_message || '';

            coverLetterEl.textContent = coverLetter || '—';
            linkedinEl.textContent = recruiterMessage || '—';

            document.getElementById('result_card_placeholder').style.display = 'none';
            document.getElementById('result_card').style.display = 'block';

            creditsCount.textContent = json.remaining_credits || creditsCount.textContent;

            lastPayload = { resumeFile: !!file, resume_text: resume_val, job_description: job_val };
            // regenBtn.disabled = false;
        } catch (err) {
            console.error(err);
            showError(err.message);
        } finally {
            setLoading(false);
            hideOverlayLoader();
        }
    }

    generateBtn.addEventListener('click', () => {
        clearError();

        const file = resumeFile.files[0];
        const resume_val = resumeText.value.trim();
        const job_val = jobDesc.value.trim();
        const token = localStorage.getItem(tokenName);

        // Client-side validation
        if (!usingSavedData && !file && !resume_val) { showError('Please upload a PDF resume or paste your resume text.'); return }
        if (!job_val) { showError('Please paste the job description.'); return }
        if (resume_val.length > MAX_RESUME_CHARS) { showError('Resume text exceeds 6000 characters.'); return }
        if (job_val.length > MAX_JOB_CHARS) { showError('Job description exceeds 5000 characters.'); return }
        if (file && file.size > MAX_PDF_BYTES) { showError('Uploaded PDF exceeds 10 MB.'); return }
        showConfirmPopup(postGenerate);
    });
    // regenBtn.addEventListener('click', postGenerate);

    copyCover.addEventListener('click', async () => {
        try { await navigator.clipboard.writeText(coverLetterEl.textContent); alert('Copied cover letter to clipboard'); }
        catch (e) { alert('Copy failed — select and copy manually'); }
    });
    copyLinkedin.addEventListener('click', async () => {
        try { await navigator.clipboard.writeText(linkedinEl.textContent); alert('Copied LinkedIn message to clipboard'); }
        catch (e) { alert('Copy failed — select and copy manually'); }
    });

    function downloadText(filename, text) {
        const blob = new Blob([text], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a'); a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
    }
    downloadCover.addEventListener('click', () => { downloadText('cover-letter.txt', coverLetterEl.textContent) });
    downloadLinkedin.addEventListener('click', () => { downloadText('linkedin-message.txt', linkedinEl.textContent) });

    // Small UX: warn if user pastes a lot of text
    resumeText.addEventListener('input', () => {
        const remaining = MAX_RESUME_CHARS - resumeText.value.length;
        if (remaining < 0) showError('Resume text exceeds limit'); else clearError();
    });
    jobDesc.addEventListener('input', () => {
        const remaining = MAX_JOB_CHARS - jobDesc.value.length;
        if (remaining < 0) showError('Job description exceeds limit'); else clearError();
    });

    function showOverlayLoader() {
        document.getElementById('ai-loader').style.display = 'flex';
    }

    function hideOverlayLoader() {
        document.getElementById('ai-loader').style.display = 'none';
    }

    // Show the confirmation popup
    function showConfirmPopup(onConfirm) {
        const overlay = document.getElementById('ai-confirm');
        overlay.style.display = 'flex';

        const cancelBtn = document.getElementById('cancel-btn');
        const proceedBtn = document.getElementById('proceed-btn');

        // Remove old listeners if any
        cancelBtn.replaceWith(cancelBtn.cloneNode(true));
        proceedBtn.replaceWith(proceedBtn.cloneNode(true));

        // Reassign variables to the new clones
        const newCancel = document.getElementById('cancel-btn');
        const newProceed = document.getElementById('proceed-btn');

        newCancel.addEventListener('click', () => {
            overlay.style.display = 'none';
        });

        newProceed.addEventListener('click', () => {
            overlay.style.display = 'none';
            if (typeof onConfirm === 'function') onConfirm();
        });
    }

    /* Generations popup logic */
    const popup = document.getElementById('generations-popup');
    const viewBtn = document.getElementById('view-generations-btn');
    const closeBtn = document.getElementById('close-generations');
    const exportBtn = document.getElementById('export-generations');

    viewBtn.addEventListener('click', () => {
        popup.style.display = 'flex';
        fetchGenerations();
    });

    closeBtn.addEventListener('click', () => {
        popup.style.display = 'none';
    });

    // Toggle details visibility
    document.addEventListener('click', async e => {
        try {
            if (e.target.classList.contains('view-details')) {
                const details = e.target.closest('.gen-item').querySelector('.gen-details');
                if (!details) return;

                if (details.style.display != "block") {

                    const genId = e.target.closest('.gen-item').getAttribute('data-gen-id');

                    // Fetch full details if needed
                    if (genId && !details.getAttribute('data-loaded')) {
                        const thisViewButton = document.getElementById(`view-details-button_${genId}`);
                        const originalText = thisViewButton.innerHTML;
                        thisViewButton.innerHTML = '<span class="btn-loader"></span>';
                        thisViewButton.disabled = true;

                        const data = await fetchGenerationById(genId);

                        if (data && data.past_generation) {
                            // details.querySelector('pre:nth-of-type(1)').textContent = data.cover_letter;
                            // details.querySelector('pre:nth-of-type(2)').textContent = data.recruiter_message;
                            details.setAttribute('data-loaded', 'true');
                            document.getElementById(`cover_lettter_${genId}`).textContent = data.past_generation.cover_letter;
                            document.getElementById(`recruiter_message_${genId}`).textContent = data.past_generation.recruiter_message;
                        }
                        thisViewButton.disabled = false;
                    }
                }
                details.style.display = details.style.display === 'block' ? 'none' : 'block';
                e.target.textContent = details.style.display === 'block' ? 'Hide' : 'View';
            }

            if (e.target.classList.contains('copy-btn')) {
                const text = e.target.previousElementSibling.textContent;
                navigator.clipboard.writeText(text);
                e.target.textContent = 'Copied!';
                setTimeout(() => e.target.textContent = 'Copy', 1500);
            }
        }
        catch (err) {
            console.log(err);

        }
    });

    exportBtn.addEventListener('click', () => {
        exportPastGenerations();
    });

    async function fetchGenerations() {
        // Show loader, hide content
        genLoader.style.display = 'flex';
        genList.style.display = 'none';

        try {
            const res = await fetch('/api/past-generations', {
                method: 'GET',
                headers: { 'Authorization': localStorage.getItem(tokenName) },
            }); // your actual endpoint
            const data = await res.json();

            if (data && data.past_generations && data.past_generations.length === 0) {
                genLoader.style.display = 'none';
                genList.style.display = 'flex';
                genList.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">📭</div
            <p class="empty-text">
            You have no saved generations yet.<br>
            Generate some cover letters and messages to see them here.</p>
        </div>`;
                return;
            }

            const pastGenerations = data.past_generations || [];

            // Hide loader, show content
            genLoader.style.display = 'none';
            genList.style.display = 'flex';

            genList.innerHTML = pastGenerations.map(g => `
      <div class="gen-item" data-gen-id="${g._id}">
        <div class="gen-header">
          <div>
            <strong>${g.title}</strong><br>
            <span class="small muted">Generated on ${moment(g.createdAt).format('MMM DD, YYYY')}</span>
          </div>
          <button class="btn small view-details" id="view-details-button_${g._id}">View</button>
        </div>
        <div class="gen-details">
          <div class="gen-section">
            <h4>Cover Letter</h4>
            <pre id="cover_lettter_${g._id}">${g.coverLetter}</pre>
            <button class="btn secondary small copy-btn">Copy Cover Letter</button>
          </div>
          <div class="gen-section">
            <h4>Recruiter Message</h4>
            <pre id="recruiter_message_${g._id}">${g.recruiterMsg}</pre>
            <button class="btn secondary small copy-btn">Copy Message</button>
          </div>
        </div>
      </div>
    `).join('');
        } catch (err) {
            genLoader.innerHTML = `<p style="color:#ff7b7b;">⚠️ Failed to load generations. Please try again.</p>`;
        }
    }

    async function fetchGenerationById(id) {
        try {
            const res = await fetch(`/api/past-generation/${id}`, {
                method: 'GET',
                headers: { 'Authorization': localStorage.getItem(tokenName) },
            });
            if (!res.ok) throw new Error('Failed to fetch generation');
            const data = await res.json();
            return data;
        } catch (err) {
            console.error(err);
            return null;
        }

    }

    async function exportPastGenerations() {
        const originalText = exportBtn.innerHTML;
        try {
            exportBtn.innerHTML = '<span class="btn-loader"></span>';
            exportBtn.disabled = true;

            const res = await fetch(`/api/export/past-generation`, {
                method: 'GET',
                headers: { 'Authorization': localStorage.getItem(tokenName) },
            });
            if (!res.ok) throw new Error('Failed to fetch generation');
            const blob = await res.blob();

            // Extract filename from response headers or fallback
            const filename = res.headers.get('Content-Disposition')?.split('filename=')[1]?.replace(/["']/g, '') || 'Ziplai.txt';

            // Trigger download
            const link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            link.download = filename;
            link.click();
            URL.revokeObjectURL(link.href);
        } catch (err) {
            console.error(err);
            alert('Failed to export generations.');
        } finally {
            exportBtn.textContent = originalText;
            exportBtn.disabled = false;
        }
    }

    if (addCreditsBtn && creditsModal) {
        addCreditsBtn.addEventListener('click', () => {
            creditsModal.classList.remove('hidden');
        });
    }

    if (buyCreditsBtn) {
        buyCreditsBtn.addEventListener('click', () => {
            buyCredits();
        });
    }

    if (closeAddCreditsBtn && creditsModal) {
        closeAddCreditsBtn.addEventListener('click', () => creditsModal.classList.add('hidden'));
    }

    let currentCountry = "US";
    let paddleInitialized = false;

    initializePaddle();

    // Initialize Paddle
    function initializePaddle() {
        try {
            // Paddle.Environment.set("sandbox");
            Paddle.Initialize({
                token: "live_465d63ba1e71c382ed1620b8313",
                // token: "test_3a3b34c28291aac344a59322372",
                eventCallback: async function (event) {
                    if (event.name === "checkout.loaded") {
                        buyCreditsBtn.disabled = false;
                        buyCreditsBtn.innerHTML = 'Buy 50 Credits';
                    }
                    else if (event.name === "checkout.completed") {
                        creditsCount.innerHTML = '<span class="credit-loader"></span>';
                        creditsModal.classList.add("hidden");

                        creditsPolling = setInterval(async () => {
                            getMyDetails({only_credits: 1});
                        }, 1000);
                        
                        // const res = await fetch('/api/generate', {
                        //   method: 'POST',
                        //   headers: token ? { 'Authorization': token } : {},
                        //   body: form
                        // })

                        // if (!res.ok) {
                        //   const t = await res.text();
                        //   throw new Error(`Server error: ${res.status} ${t}`);
                        // }
                        // else {

                        // }
                    }
                }
            });
            paddleInitialized = true;
        } catch (error) {
            console.error("Initialization error:", error);
        }
    }

    function buyCredits() {
        buyCreditsBtn.disabled = true;
        buyCreditsBtn.innerHTML = 'Buy 50 Credits <span class="btn-loader"></span>';

        Paddle.Checkout.open({
            settings: {
                displayMode: "overlay",
                theme: "light",
                locale: "en",
                allowLogout: false
            },
            items: [
                {
                    priceId: "pri_01ka5dyyd4xjeybczrvq4zx39d", // Replace with your actual price ID
                    // priceId: "pri_01k8z7kymk6agb5h5jqmmreq7y",
                    quantity: 1
                }
            ],
            customer: {
                id: gatewayCustomerId
            }
        });
    }

    document.getElementById('logout-btn').addEventListener('click', () => {
        if (confirm('Are you sure you want to log out of Ziplai?')) {
            const tokenName = localStorage.getItem('ziplai_token_name');
            if (tokenName) {
                localStorage.removeItem(tokenName);
                localStorage.removeItem('ziplai_token_name');
            }
            window.location.href = '/login';
            return;
        }
    });

    function showToast(message = "Credits added successfully!") {
        const toast = document.getElementById("toast");
        toast.querySelector(".toast-message").textContent = message;

        toast.classList.add("show");

        setTimeout(() => {
            toast.classList.remove("show");
        }, 3500);
    }

}

init();