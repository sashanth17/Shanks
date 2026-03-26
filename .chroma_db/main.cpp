#include<bits/stdc++.h>
using namespace std;

string ans = "";

class string_number{
    public:
    string number;
    int len;
    string_number(){
        number = "";
    }
    string_number(string number)
    {
        this->number = number;
        this->len = number.size();
    }
    
    string_number operator+(string_number new_num)
    {
        string temp = this->number;
        string new_temp = new_num.number;
        
        std::reverse((temp).begin(), (temp).end());
        reverse(new_temp.begin() , new_temp.end());
        
        int carry = 0;
        string sum = "";
        
        int s_1 = temp.size();
        int s_2 = new_temp.size();
        
        int i;
        for( i=0; i<min(s_1 , s_2); i++)
        {
            int a = temp[i] - '0';
            int b = new_temp[i] - '0';
            
            int s = a + b + carry;
            
            sum += to_string(s % 10);
            carry = s / 10;
        }
        int size = max(s_1 , s_2);
        if(s_1 < s_2) swap(temp , new_temp);
        
        while(i < size)
        {
            int a = temp[i] - '0';
            int s = a + carry;
            
            sum += to_string(s % 10);
            carry = s / 10;
            
            i++;
        }
        
        if(carry > 0) sum += to_string(carry);
        
        reverse(sum.begin() , sum.end());
        return string_number(sum);
        
    }
};

bool check(string_number num , unordered_map<int,int>  mp , string& curr)
{
    string_number new_num("0");
    curr += num.number;
    
    // if(mp.count(0)) mp.erase(0);
    
    // cout << "number : " << num.number << "\n";
    // cout << "map : ";
    // for(auto it : mp) {
    //     cout << it.first << "-" << it.second << " ";
    // }
    // cout << "\n";
    
    for(int i=num.len-1; i>=0; i--)
    {
        string_number n(string(1 , num.number[i]));
        
        new_num = new_num + n;
        
        
        if(mp.count(num.number[i] -'0')) {
            mp[num.number[i] - '0']--;
            if(mp[num.number[i] - '0'] <= 0) mp.erase(num.number[i] - '0');
        }
        else return false;
    }
    // cout << "num_checked : " << num.number << "\n";
    
    if(mp.empty() && stoi(num.number) < 10) {
        ans = curr;
        return true;
    }
    else return check(new_num , mp , curr);
}

unordered_set<string> visited;

bool rec(string &s, string curr, vector<bool> &used, unordered_map<int,int> &mp)
{
    // cout << "curr : " << curr << "\n";

    if (visited.count(curr)) return false;
    visited.insert(curr);

    string temp = "";
    if (check(curr, mp, temp)) return true;

    for (int i = 0; i < s.size(); i++)
    {
        if (used[i]) continue;

        // skip duplicates
        if (i > 0 && s[i] == s[i - 1] && !used[i - 1]) continue;

        used[i] = true;

        if (rec(s, curr + s[i], used, mp)) return true;

        used[i] = false;
    }

    return false;
}

void solve(){
    string s;
    cin >> s;
    
    ans = "";
    visited.clear();
    
    int size = s.size();
    
    sort(s.begin() , s.end());
    reverse(s.begin() , s.end());
    
    unordered_map<int,int> mp;
    for(auto it : s)
    {
        mp[it - '0']++;
    }
    
    if(size == 1) 
    {
        cout << s << "\n";
        return;
    }
    vector<bool> used(size+1 , false);
    rec( s , "" ,  used , mp);
    
    cout << ans << "\n";
}

signed main(){
    ios_base::sync_with_stdio(false);
    cin.tie(0);
    cout.tie(0);
    
    int test = 1;
    cin >> test;
    
    while(test--)
    {
        solve();
    }
}