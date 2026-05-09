import { ChangeDetectorRef, Component } from '@angular/core';
import { APIService } from '../../services/api.service';
import { FormControl } from '@angular/forms';
import { ICD11Result, PubmedResult, SymptomAnalysis } from '../../interfaces';

@Component({
    selector: 'app-mydoc',
    templateUrl: './mydoc.component.html',
    styleUrls: ['./mydoc.component.scss'],
    standalone: false
})
export class MydocComponent {
    progressMessage = '';
    isLoading = false
    queryControl = new FormControl('');
    selectedThread = new FormControl('');
    threads: any[] = []; // This will hold the list of threads fetched from the API
    conversationHistory: any[] = []; // This will 11hold the conversation history for the selected thread
    currentBotMessage = '';
    symptomAnalysis: SymptomAnalysis | null = null;
    icd11Results: ICD11Result[] = [];
    pubmedResults: PubmedResult[] = [];

    constructor(private apiService: APIService, private cdr: ChangeDetectorRef) { 
        this.fetchMe();
        this.selectedThread.valueChanges.subscribe(threadId => {
            if (threadId) {
                this.fetchThreadData(threadId);
            }
        });
    }

    fetchMe() {
        this.apiService.getData('/me').subscribe({
            next: (response) => {
                console.log('User info from API:', response);
                this.fetchThreads();

                // Handle the response as needed
            }, error: (error) => {
                console.error('Error fetching user info:', error);
            }
        });
    }

    fetchThreads() {
        this.apiService.getData('/threads').subscribe({
            next: (response) => {
                console.log('Threads from API:', response);
                this.threads = response; // Assuming the API returns an array of threads
                this.cdr.markForCheck(); // Trigger change detection to update the UI
            }, error: (error) => {
                console.error('Error fetching threads:', error);
            }
        });
    }

    fetchThreadData(threadId: string) {
        this.apiService.getData(`/thread/${threadId}`).subscribe({
            next: (response) => {
                console.log('Thread data from API:', response);
                this.conversationHistory = [];
                response.forEach((turn: any) => {
                    if (turn.role === 'user' || turn.role === 'assistant') {
                        turn.message = turn.role === 'user' ? turn.query : turn.query_response;
                        this.conversationHistory.push(turn);
                    }
                });
                // Handle the response as needed
            }, error: (error) => {
                console.error('Error fetching thread data:', error);
            }
        });
    }

    sendMessage() {
        const query = this.queryControl.value;
        if (query) {
            this.queryControl.setValue(''); // Clear the input field
            let route = '/analyze'
            this.isLoading = true;
            this.conversationHistory.push({
                role: 'user',
                message: query,
                timestamp: new Date()
            });
            this.apiService.streamPostData(route, { query }).subscribe(
                {
                    next: (event: any) => {
                        switch (event.type) {
                            case 'progress':
                                this.progressMessage = event.message;
                                break;


                            case 'chat_stream':
                                // Append tokens for the typewriter effect
                                this.currentBotMessage += event.token;
                                break;

                            case 'done':
                                this.finalizeMessage();
                                break;
                        }
                    },
                    error: (err) => {
                        console.error('Stream failed', err);
                        this.currentBotMessage = 'An error occurred during analysis.';
                        this.finalizeMessage();
                    },
                    complete: () => {
                        if (this.isLoading) this.finalizeMessage();
                    }
                });
        }
    }

    private finalizeMessage() {
        this.isLoading = false;
        if (this.currentBotMessage) {
            this.conversationHistory.push({
                role: 'bot',
                message: this.currentBotMessage,
                timestamp: new Date()
            });
            this.currentBotMessage = '';
        }
    }
}
